import { SanitizedElement, ElementRole } from './payload.js';
import {
  StructuredTaskIntent,
  FormFieldAssignment,
  tokenizeSemanticText,
  normalizeSemanticText
} from './grounding.js';
import { extractSearchQueryFromGoal } from './domain-playbooks.js';

export type ActionKind =
  | 'observe'
  | 'navigate'
  | 'click'
  | 'hover'
  | 'type'
  | 'select'
  | 'drag_and_drop'
  | 'upload_file'
  | 'scroll'
  | 'wait'
  | 'extract'
  | 'answer'
  | 'request_user_confirmation'
  | 'request_user_input'
  | 'batch'
  | 'spawn_subagents'
  | 'web_search'
  | 'finish'
  | 'blocked';

export type RiskLevel = 'safe' | 'protected' | 'blocked';

export interface ExecutionFeedback {
  readonly lastActionId?: string;
  readonly lastActionKind?: string;
  readonly targetLocalId?: string;
  readonly verified?: boolean;
  readonly outcomeCode?: string;
  readonly stepIndex?: number;
  readonly completedTasks?: ReadonlyArray<string>;
  readonly remainingTasks?: ReadonlyArray<string>;
}

export type ObjectiveStatus = 'pending' | 'active' | 'completed' | 'blocked' | 'failed';

export type ObjectiveIntent =
  | 'navigate'
  | 'search'
  | 'select_result'
  | 'open_section'
  | 'inspect'
  | 'extract'
  | 'compare'
  | 'summarize'
  | 'fill'
  | 'submit'
  | 'download'
  | 'verify';

export type ObjectiveEvidenceKind =
  | 'url'
  | 'element'
  | 'text'
  | 'input_value'
  | 'dialog'
  | 'attribute'
  | 'scroll'
  | 'visual_change';

export type RecoveryStrategy =
  | 'reperceive'
  | 'wait_for_hydration'
  | 'retry_target'
  | 'scroll_to_target'
  | 'navigate_fallback'
  | 'refresh_once'
  | 'request_user_input'
  | 'fail_safe';

export interface TaskObjective {
  readonly id: string;
  readonly sequence: number;
  readonly intent: ObjectiveIntent;
  readonly description: string;
  readonly targetPhrase?: string;
  readonly extractedValue?: string;
  readonly expectedEvidence: ReadonlyArray<string>;
  readonly status: ObjectiveStatus;
  readonly dependsOn?: ReadonlyArray<string>;
}

export interface ObjectiveEvidence {
  readonly objectiveId: string;
  readonly kind: ObjectiveEvidenceKind;
  readonly summary: string;
  readonly sourceActionId?: string;
  readonly verified: boolean;
}

export interface ObjectiveProgress {
  readonly currentObjectiveId?: string;
  readonly completedObjectiveIds: ReadonlyArray<string>;
  readonly blockedObjectiveIds: ReadonlyArray<string>;
  readonly attemptCountByObjective: Readonly<Record<string, number>>;
  readonly evidence: ReadonlyArray<ObjectiveEvidence>;
}

export interface TaskSpecification {
  readonly goal: string;
  readonly extractedSearchQuery?: string;
  readonly objectives: ReadonlyArray<TaskObjective>;
  /** Compatibility projection. Objectives are authoritative. */
  readonly tasksToDo?: ReadonlyArray<string>;
  readonly tasksNotToDo: ReadonlyArray<string>;
  readonly successCriteria: string;
  readonly requiresSubAgents?: boolean;
  readonly subAgentTasks?: ReadonlyArray<{
    readonly subAgentId: string;
    readonly targetEntityOrUrl: string;
    readonly goal: string;
  }>;
}

export function createInitialObjectiveProgress(specification: TaskSpecification): ObjectiveProgress {
  const first = [...specification.objectives]
    .sort((a, b) => a.sequence - b.sequence)
    .find((objective) => !objective.dependsOn?.length);
  return {
    currentObjectiveId: first?.id,
    completedObjectiveIds: [],
    blockedObjectiveIds: [],
    attemptCountByObjective: {},
    evidence: []
  };
}

export function getCurrentObjective(
  specification: TaskSpecification,
  progress: ObjectiveProgress
): TaskObjective | undefined {
  const byId = new Map(specification.objectives.map((objective) => [objective.id, objective]));
  const current = progress.currentObjectiveId ? byId.get(progress.currentObjectiveId) : undefined;
  if (current && !progress.completedObjectiveIds.includes(current.id) && !progress.blockedObjectiveIds.includes(current.id)) {
    return current;
  }
  return [...specification.objectives]
    .sort((a, b) => a.sequence - b.sequence)
    .find((objective) =>
      !progress.completedObjectiveIds.includes(objective.id) &&
      !progress.blockedObjectiveIds.includes(objective.id) &&
      (objective.dependsOn || []).every((id) => progress.completedObjectiveIds.includes(id))
    );
}

export function recordObjectiveEvidence(
  progress: ObjectiveProgress,
  evidence: ObjectiveEvidence
): ObjectiveProgress {
  const duplicate = progress.evidence.some((item) =>
    item.objectiveId === evidence.objectiveId &&
    item.kind === evidence.kind &&
    item.summary === evidence.summary &&
    item.sourceActionId === evidence.sourceActionId
  );
  return duplicate ? progress : { ...progress, evidence: [...progress.evidence, evidence].slice(-100) };
}

export function completeObjectiveWithEvidence(
  specification: TaskSpecification,
  progress: ObjectiveProgress,
  objectiveId: string
): ObjectiveProgress {
  const objective = specification.objectives.find((item) => item.id === objectiveId);
  if (!objective || !progress.evidence.some((item) => item.objectiveId === objectiveId && item.verified)) return progress;
  const completedObjectiveIds = [...new Set([...progress.completedObjectiveIds, objectiveId])];
  const interim = { ...progress, completedObjectiveIds, currentObjectiveId: undefined };
  return { ...interim, currentObjectiveId: getCurrentObjective(specification, interim)?.id };
}

export function canFinishTask(
  specification: TaskSpecification,
  progress: ObjectiveProgress
): { readonly satisfied: boolean; readonly reason: string } {
  const incomplete = specification.objectives.filter((objective) => !progress.completedObjectiveIds.includes(objective.id));
  if (incomplete.length > 0) {
    return { satisfied: false, reason: `Incomplete objectives: ${incomplete.map((item) => item.id).join(', ')}` };
  }
  const unsupported = specification.objectives.filter((objective) =>
    !progress.evidence.some((item) => item.objectiveId === objective.id && item.verified)
  );
  if (unsupported.length > 0) {
    return { satisfied: false, reason: `Missing verified evidence: ${unsupported.map((item) => item.id).join(', ')}` };
  }
  return { satisfied: true, reason: 'All objectives have verified completion evidence' };
}

export type ExpectedPostcondition =
  | { readonly kind: 'dialog_visible'; readonly dialogId?: string }
  | { readonly kind: 'panel_visible'; readonly namePattern?: string }
  | { readonly kind: 'element_visible'; readonly targetLocalId?: string; readonly namePattern?: string }
  | { readonly kind: 'element_count_changed'; readonly minimumDelta?: number }
  | { readonly kind: 'visual_change'; readonly minimumChangeRatio?: number }
  | { readonly kind: 'map_location_changed'; readonly locationPattern?: string }
  | { readonly kind: 'search_results_visible'; readonly queryPattern?: string }
  | { readonly kind: 'content_visible'; readonly textPattern?: string }
  | { readonly kind: 'url_changed'; readonly expectedPathFragment?: string }
  | { readonly kind: 'attribute_changed'; readonly attributeName: 'aria-expanded' | 'aria-checked' | 'aria-selected' | 'disabled' | 'open' | 'class'; readonly expectedValue?: string }
  | { readonly kind: 'value_present'; readonly expectedValueFragment?: string }
  | { readonly kind: 'select_changed'; readonly expectedOptionValue?: string }
  | { readonly kind: 'status_changed'; readonly statusId?: string }
  | { readonly kind: 'scroll_changed'; readonly direction: 'up' | 'down' | 'top' | 'bottom' }
  | { readonly kind: 'visibility_changed'; readonly targetLocalId?: string; readonly state: 'visible' | 'hidden' }
  | { readonly kind: 'answer_supported'; readonly queryTopic?: string };

export interface TaskContract {
  readonly supported: boolean;
  readonly goalPattern: string;
  readonly expectedTerminal: ExpectedPostcondition;
  readonly expectedTargetNameSubstring?: string;
  readonly structuredIntent?: StructuredTaskIntent;
  readonly isPassive?: boolean;
  readonly isAnswerGoal?: boolean;
  readonly isMultiStep?: boolean;
  readonly mode?: 'act' | 'answer' | 'extract';
  readonly queryTopic?: string;
  readonly abstentionReason?: string;
  readonly requiresUserInput?: boolean;
  readonly userInputKind?: 'credentials' | 'text_input';
  readonly userInputPrompt?: string;
}

const GENERIC_CONTEXT_WORDS = new Set([
  'pending',
  'request',
  'requests',
  'item',
  'items',
  'row',
  'user',
  'the',
  'a',
  'an',
  'this',
  'that',
  'safe',
  'preview',
  'details',
  'result',
  'results',
  'table',
  'page'
]);

export function cleanContextPhrase(phrase: string | undefined): string | undefined {
  if (!phrase) return undefined;
  const trimmed = phrase.trim();
  if (GENERIC_CONTEXT_WORDS.has(trimmed.toLowerCase())) return undefined;
  return trimmed;
}

/**
 * Extracts multiple form field and value assignments from natural language instructions.
 * E.g. "in the place of name type kushagra and email tyoe kushagarasingh175@gmail.com"
 */
export function parseFormFieldAssignments(text: string): FormFieldAssignment[] {
  let norm = text.replace(/([a-zA-Z0-9_-]+)\.\s+/g, '$1 ').replace(/\s+\.\s+/g, ' ').replace(/\s+/g, ' ').trim();
  norm = norm.replace(/\btyoe\b/gi, 'type');

  const fields: FormFieldAssignment[] = [];
  const segments = norm.split(/\s+(?:and|then|also)\s+|;/i);
  if (segments.length < 2 && !/^(?:in\s+(?:the\s+)?(?:place\s+of|field\s+of)|for\s+[a-z0-9_-]+\s+(?:type|enter))/i.test(norm)) {
    return [];
  }

  for (const seg of segments) {
    const s = seg.trim();
    const mA = s.match(/^(?:(?:in|for|at|into)\s+(?:the\s+)?(?:place\s+of\s+|field\s+of\s+|box\s+of\s+)?)?([a-zA-Z0-9_-]+)\s+(?:type|enter|fill|put|write|as|is|=)\s+["']?([a-zA-Z0-9_@.+-]+)["']?$/i);
    const mB = s.match(/^(?:type|enter|fill|put|write)\s+["']?([a-zA-Z0-9_@.+-]+)["']?\s+(?:in|into|for|to|as)\s+(?:the\s+)?([a-zA-Z0-9_\s-]+?)$/i);
    const mC = s.match(/^["']?([a-zA-Z0-9_@.+-]+)["']?\s+(?:in|into|for|as)\s+(?:the\s+)?([a-zA-Z0-9_\s-]+?)$/i);
    const mD = s.match(/^(?:type|enter|fill)\s+(?:in|into)\s+(?:the\s+)?([a-zA-Z0-9_-]+)\s+["']?([a-zA-Z0-9_@.+-]+)["']?$/i);

    if (mA) {
      let target = mA[1].trim();
      const value = mA[2].trim();
      if (target && value && !['type', 'enter', 'fill', 'write'].includes(target.toLowerCase())) {
        fields.push({ target, value });
      }
    } else if (mB) {
      const value = mB[1].trim();
      let target = mB[2].replace(/^(?:the|field\s+of)\s+/i, '').trim();
      if (target && value) {
        fields.push({ target, value });
      }
    } else if (mC) {
      const value = mC[1].trim();
      let target = mC[2].replace(/^(?:the|field\s+of)\s+/i, '').trim();
      if (target && value) {
        fields.push({ target, value });
      }
    } else if (mD) {
      const target = mD[1].trim();
      const value = mD[2].trim();
      if (target && value) {
        fields.push({ target, value });
      }
    }
  }

  return fields;
}

/**
 * Resolves a natural-language goal into a closed, structured task contract
 * binding expected semantic terminal postconditions to the run.
 */
export function resolveTaskContract(goal: string): TaskContract {
  let g = (goal || '').trim().toLowerCase().replace(/[?!.]+$/, '').trim();
  let prev = '';
  const ACTION_PREFIX_REGEX = /^(?:(?:please|kindly)\s+|(?:can|could|would|will)\s+(?:you|we)\s+|(?:i\s+(?:want|need|would\s+like)\s+(?:you\s+)?to)\s+|(?:go\s+ahead\s+and)\s+|(?:hey|hi|ok)\s+(?:privapilot[,!]?\s+)?(?:please\s+)?|(?:do\s+(?:the\s+)?|perform\s+(?:the\s+)?|start\s+(?:the\s+)?|execute\s+(?:the\s+)?|proceed\s+with\s+(?:the\s+)?|try\s+to\s+|let's\s+|lets\s+|let\s+us\s+)|(?:help\s+me\s+(?:in\s+|with\s+|out\s+with\s+|to\s+|by\s+|on\s+)?|assist\s+me\s+(?:in\s+|with\s+|to\s+)?)|(?:and\s+then|then|after\s+that|and|also|now|next|so)\s+)+/i;
  while (g && g !== prev) {
    prev = g;
    g = g.replace(ACTION_PREFIX_REGEX, '').trim();
  }

  // Normalize colloquial contractions and typos
  g = g
    .replace(/\bchekinup\b/g, 'check')
    .replace(/\bcheckin\b/g, 'check')
    .replace(/\bcheckup\b/g, 'check')
    .replace(/\bchecking\s+up\b/g, 'check')
    .replace(/\bchecking\b/g, 'check')
    .replace(/\btyoe\b/g, 'type')
    .replace(/\btpye\b/g, 'type')
    .replace(/\bclik\b/g, 'click')
    .replace(/\bcilck\b/g, 'click')
    .replace(/\bclcik\b/g, 'click')
    .replace(/\bclck\b/g, 'click')
    .replace(/\bclikc\b/g, 'click')
    .replace(/\bselet\b/g, 'select')
    .replace(/\bselct\b/g, 'select')
    .replace(/\bserach\b/g, 'search')
    .replace(/\bserch\b/g, 'search')
    .replace(/\bdown;oad\b/g, 'download')
    .replace(/\bdownlaod\b/g, 'download')
    .replace(/\bdoenmlao\b/g, 'download')
    .replace(/\bdomwloadn\b/g, 'download')
    .replace(/\bdomwload\b/g, 'download')
    .replace(/\bdowload\b/g, 'download')
    .replace(/\bdwnload\b/g, 'download')
    .replace(/\bdownld\b/g, 'download')
    .replace(/\bdownlod\b/g, 'download')
    .replace(/\bse\b(?=\s+(?:for|at|the|thr|in|to|on)\b)/g, 'see')
    .replace(/\bthr\b/g, 'the')
    .replace(/\bhre\b/g, 'here')
    .replace(/\bstrtup\b/g, 'startup')
    .replace(/\bstrt-up\b/g, 'start-up')
    .replace(/\bshw\b/g, 'show')
    .replace(/\bopn\b/g, 'open')
    .replace(/\bfnd\b/g, 'find');

  // Strip leading navigation clauses (e.g. "open bhuvan and explore earth observation" -> "explore earth observation")
  const navPrefixMatch = g.match(/^(?:open|go\s+to|visit|launch|load|navigate\s+to)\s+(?:https?:\/\/[^\s]+|[a-zA-Z0-9_.-]+)\s+(?:and\s+then|then|after\s+that|and|,)\s+(.+)$/i);
  if (navPrefixMatch && navPrefixMatch[1]) {
    g = navPrefixMatch[1].trim();
  }

  if (!g) {
    return {
      supported: false,
      goalPattern: 'empty',
      expectedTerminal: { kind: 'status_changed' },
      abstentionReason: 'EMPTY_GOAL: Goal cannot be empty'
    };
  }

  if (isPureNavigationGoal(g)) {
    return {
      supported: true,
      goalPattern: 'navigate_url',
      expectedTerminal: { kind: 'status_changed' },
      expectedTargetNameSubstring: g,
      structuredIntent: {
        intent: 'navigate' as any,
        targetPhrase: g,
        targetTokens: tokenizeSemanticText(g)
      }
    };
  }

  const isMultiStep = /\b(?:and\s+then|then|after\s+that|next|also|and\s+see|and\s+check|and\s+search|and\s+find|and\s+tell|and\s+type|and\s+select|and\s+click|and\s+hover|and\s+drag|and\s+drop|and\s+upload)\b/i.test(g) ||
    (/(?:click|go\s+to|navigate\s+to|open)\s+.+?\s+(?:and|\bthen\b)\s+(?:search|find|filter|type|tell|check|see|count|how\s+many)/i.test(g));

  // Explicit conversational / out-of-domain query handling - pass to LLM as answer goal
  if (/(?:poem|story|recipe|joke|capital of|calculate|solve math|2\+2|weather|song|quantum)/i.test(g)) {
    return {
      supported: true,
      goalPattern: 'conversational_query',
      mode: 'answer',
      isAnswerGoal: true,
      expectedTerminal: { kind: 'answer_supported' },
      structuredIntent: {
        intent: 'observe',
        targetPhrase: g,
        targetTokens: tokenizeSemanticText(g)
      }
    };
  }

  // 1a. Information retrieval, question-answering, and summarization goals (e.g. "how many submissions are done", "summarize the mission key milestones", "analyze pricing", "tell me when it was first launched")
  const isQuestionOrRetrieval =
    /(?:how\s+many|count\s+(?:of|for)|number\s+of|total\s+(?:count|number|submissions?)|submissions?\s+(?:are\s+)?(?:done|completed|submitted)|what\s+is|what\s+are|which\s+tab|tell\s+me|summarize|summarise|milestones?|key\s+milestones?|explain|analyze|analyse|overview|findings|give\s+me\s+(?:a\s+)?(?:summary|overview|details?|breakdown)|find\s+.*?\s+and\s+(?:tell|summarize|explain)|search\s+.*?\s+and\s+(?:tell|summarize|explain)|check\s+.*?\s+and\s+(?:tell|summarize|explain)|read\s+.*?\s+and\s+(?:tell|summarize|explain)|(?:when|who|where|why)\s+(?:was|is|are|were|organizes|coordinates|leads|founded|created|launched|started)|when\s+it\s+was|who\s+organizes)/i.test(g);

  if (isQuestionOrRetrieval) {
    let queryTopic = 'information';
    if (/submi/i.test(g)) queryTopic = 'submissions';
    else if (/problem|ps\b/i.test(g)) queryTopic = 'problem statements';
    else if (g.includes('count') || g.includes('how many')) queryTopic = 'count';
    else if (/(?:milestone|milestones)/i.test(g)) queryTopic = 'mission key milestones';
    else if (/(?:summarize|summarise|summary)/i.test(g)) queryTopic = 'summary';
    else if (/(?:analyze|analyse|analysis)/i.test(g)) queryTopic = 'analysis';
    else if (/(?:launch|start|found|create|when)/i.test(g) && /(?:organiz|lead|head|manage|who)/i.test(g)) queryTopic = 'launch date and organizer';
    else if (/(?:launch|start|found|create|when)/i.test(g)) queryTopic = 'launch date';
    else if (/(?:organiz|lead|head|manage|who)/i.test(g)) queryTopic = 'organizer';

    return {
      supported: true,
      goalPattern: 'answer_question',
      mode: 'answer',
      isAnswerGoal: true,
      isMultiStep: true,
      isPassive: false, // NOT passive - requires active search, navigation, reading, and LLM synthesis
      queryTopic,
      expectedTerminal: { kind: 'answer_supported', queryTopic },
      structuredIntent: {
        intent: 'observe',
        targetPhrase: queryTopic,
        targetTokens: tokenizeSemanticText(queryTopic)
      }
    };
  }

  // 1b. Browser resource operations (bookmarks, tabs, history)
  // Only match when explicitly checking/managing Chrome/browser internal resources (e.g. "open bookmarks manager", "check my bookmarks")
  // and NOT when clicking an on-page control or button (e.g. "click bookmarks", "clcik bookmarks", "click tabs")
  if (/\b(?:bookmarks?|tabs?|history)\b/i.test(g) && !/\b(?:click|clcik|clik|cilck|tap|press)\b/i.test(g)) {
    const isManage = /\b(?:open|go\s+to|manage|show|launch)\b/i.test(g);
    return {
      supported: true,
      goalPattern: 'browser_resource',
      mode: 'act',
      isPassive: true,
      expectedTerminal: { kind: 'status_changed' },
      structuredIntent: {
        intent: isManage ? ('navigate' as any) : 'observe',
        targetPhrase: 'bookmarks',
        targetTokens: tokenizeSemanticText('bookmarks')
      }
    };
  }

  // 1c. True passive observation or immediate finish task (e.g. "finish goal", "observe page", "look around")
  if (
    /^(?:observe|look\s+around|just\s+look|finish)\b/i.test(g) ||
    /^(?:check|scan|look|see|inspect)\s+(?:at\s+)?(?:the\s+)?(?:status|screen|view|around)\b/i.test(g)
  ) {
    return {
      supported: true,
      goalPattern: 'observe_status',
      expectedTerminal: { kind: 'status_changed' },
      structuredIntent: {
        intent: 'observe',
        targetTokens: []
      },
      isPassive: true
    };
  }

  // 2. Preview / Drawer / Modal inspection
  if (/(?:open|inspect|view)\s+(?:.*?\s+)?(?:preview|drawer|details?|summary|profile|settings)/i.test(g) || /preview/i.test(g)) {
    const contextMatch = g.match(/(?:preview|drawer|details?|summary|profile|settings)\s+(?:for|in|of|under)\s+([a-zA-Z0-9_-]+)/i);
    const contextPhrase = cleanContextPhrase(contextMatch ? contextMatch[1].trim() : undefined);
    let targetPhrase = 'preview';
    let dialogId = 'preview';
    if (g.includes('details')) {
      targetPhrase = 'View Details';
      dialogId = 'details';
    } else if (g.includes('drawer')) {
      targetPhrase = 'drawer';
      dialogId = 'drawer';
    }
    return {
      supported: true,
      goalPattern: 'preview_drawer',
      expectedTerminal: { kind: 'dialog_visible', dialogId },
      expectedTargetNameSubstring: targetPhrase,
      structuredIntent: {
        intent: 'click',
        targetPhrase,
        roleHint: 'button',
        targetTokens: tokenizeSemanticText(targetPhrase),
        contextPhrase
      }
    };
  }

  // 2a. Active element search/exploration intent (e.g. "see for the startup program here", "find startup", "look for career", "explore earth observation")
  const activeExplorationMatch = g.match(/^(?:see|se|look|find|explore)\s+(?:for\s+)?(?:the\s+)?([a-zA-Z0-9_\-\s]{2,40}?)(?:\s+here|\s+now|\s+page|\s+section)?$/i);
  if (activeExplorationMatch && activeExplorationMatch[1] && !/^(?:status|page|screen|view|details|preview|drawer)$/i.test(activeExplorationMatch[1].trim())) {
    const rawTarget = activeExplorationMatch[1].trim().replace(/^(?:to|for|at)\s+/i, '');
    const cleanTarget = rawTarget.replace(/\b(?:program|tab|link|section|button|menu|item)\b/gi, '').trim() || rawTarget;
    return {
      supported: true,
      goalPattern: 'click_action',
      expectedTerminal: { kind: 'status_changed' },
      expectedTargetNameSubstring: cleanTarget,
      structuredIntent: {
        intent: 'click',
        targetPhrase: cleanTarget,
        targetTokens: tokenizeSemanticText(cleanTarget)
      },
      isPassive: false
    };
  }

  // 2b. Form fill with credentials / user input requested (e.g. "type email nad pass", "fill sih login for me")
  if (
    /(?:fill|type|enter|log\s*in\s+with)\s+(?:.*?\s+)?(?:login|credentials|email\s+(?:nad|and)\s+pass(?:word)?|user(?:name)?\s+(?:nad|and)\s+pass(?:word)?)/i.test(g) ||
    /^(?:fill\s+)?(?:sih\s+)?login(?:\s+for\s+me)?$/i.test(g) ||
    /^(?:type|enter|fill)\s+(?:my\s+)?(?:email\s+(?:nad|and)\s+pass(?:word)?|credentials)$/i.test(g)
  ) {
    return {
      supported: true,
      goalPattern: 'form_fill_credentials',
      expectedTerminal: { kind: 'value_present' },
      expectedTargetNameSubstring: 'email',
      requiresUserInput: true,
      userInputKind: 'credentials',
      userInputPrompt: 'Please provide your credentials below so PrivaPilot can securely fill the login fields locally.',
      structuredIntent: {
        intent: 'type',
        targetPhrase: 'email',
        roleHint: 'input',
        targetTokens: ['email', 'username', 'login']
      }
    };
  }

  // 3. Search / Find / Locate / Type / Fill / Enter / Set / Write / Filter / Chatbox
  const hasCompoundAction =
    /\b(?:and\s+then|then|after\s+that|next)\s+(?:type|fill|enter|write|search|filter|find)\b/i.test(g) ||
    /\b(?:and|then)\s+(?:type|fill|enter|write)\b/i.test(g);
  const isExplicitClickVerb =
    /^(?:(?:please|kindly)\s+)?(?:click|press|tap)\s+/i.test(g) &&
    !hasCompoundAction &&
    !/^(?:(?:please|kindly)\s+)?(?:click|press|tap)\s+(?:on\s+)?(?:the\s+)?(?:search(?:\s+bar|\s+box|\s+input|\s+field)?|input|field)\s+(?:and\s+)?(?:type|fill|enter|write)\b/i.test(g);
  if (!isExplicitClickVerb && /(?:search|find|locate|type|fill|enter|write|set|filter|query|telemetry|chatbox|chat\b)/i.test(g)) {
    const hasSubmitSuffix = /\b(?:and\s+(?:send|sent|submit|press\s+enter|hit\s+enter|post))\b/i.test(g) ||
      /\bsearch\b/i.test(g);
    let cleanGoal = g.replace(/\b(?:and\s+(?:send|sent|submit|press\s+enter|hit\s+enter|post))\b/i, '').trim();
    cleanGoal = cleanGoal.replace(/^(?:can\s+you|could\s+you|please|kindly|i\s+want\s+you\s+to)\s+/i, '').replace(/\?+$/, '').trim();

    let targetPhrase = 'search';
    let requestedValue = '';

    // Pattern 1: type in/into (the) <target> <value> (e.g. "type in the chatbox hi", "type in search cats")
    const inTargetMatch = cleanGoal.match(/^(?:type|fill|enter|write|set)\s+(?:in|into)\s+(?:the\s+)?([a-zA-Z0-9_\s-]+?)\s+(?:to\s+be\s+|as\s+)?(?:["']([^"']+)["']|([a-zA-Z0-9_@.-]+))$/i);

    // Pattern 2: fill (the) <target> with <value> (e.g. "fill the search field with telemetry")
    const fillWithMatch = cleanGoal.match(/^(?:fill|type|enter|write|set)\s+(?:the\s+)?([a-zA-Z0-9_\s-]+?)\s+with\s+["']?([^"']+)["']?$/i);

    // Pattern 3: type <value> in/into (the) <target> (e.g. "type admin@example.com into email", "type hi into chat")
    const valInTargetMatch = cleanGoal.match(/^(?:type|fill|enter|write|set)\s+["']?([^"']+)["']?\s+(?:into|in)\s+(?:the\s+)?["']?([^"']+)["']?$/i);

    // Pattern 4: search for <value> (e.g. "search for test")
    const searchForMatch = cleanGoal.match(/^(?:search|filter|find|locate)(?:\s+(?:requests\s+for|for|query|text))?\s+["']?([^"']+)["']?$/i);

    const formAssignments = parseFormFieldAssignments(cleanGoal);

    if (formAssignments.length > 0) {
      targetPhrase = formAssignments[0].target;
      requestedValue = formAssignments[0].value;
    } else if (inTargetMatch) {
      targetPhrase = inTargetMatch[1].trim();
      requestedValue = (inTargetMatch[2] || inTargetMatch[3]).trim();
    } else if (fillWithMatch) {
      targetPhrase = fillWithMatch[1].trim();
      requestedValue = fillWithMatch[2].trim();
    } else if (valInTargetMatch) {
      requestedValue = valInTargetMatch[1].trim();
      targetPhrase = valInTargetMatch[2].trim();
    } else if (searchForMatch) {
      targetPhrase = 'search';
      requestedValue = searchForMatch[1].trim();
    } else {
      const filterMatch = cleanGoal.match(/(?:search|type|fill|enter|write|set|filter|find|locate)(?:\s+(?:requests\s+for|for|text|query|the\s+search\s+field\s+with|the\s+field\s+with|the\s+input\s+with|this\s+field\s+with|this\s+input\s+with|the\s+input\s+to|in\s+this\s+field|into\s+this\s+field|in\s+the\s+field|with))?\s+["']?([^"']+)["']?/i);
      requestedValue = filterMatch ? filterMatch[1].replace(/\?+$/, '').trim() : '';
      if (cleanGoal.includes('search')) targetPhrase = 'search';
      else if (cleanGoal.includes('filter')) targetPhrase = 'filter';
      else if (cleanGoal.includes('chat')) targetPhrase = 'chatbox';
    }

    if (requestedValue) {
      const cleanedVal = extractSearchQueryFromGoal(requestedValue);
      if (cleanedVal && cleanedVal.length > 0) {
        requestedValue = cleanedVal;
      }
    }

    return {
      supported: true,
      goalPattern: 'search_filter',
      isMultiStep,
      expectedTerminal: { kind: 'value_present', expectedValueFragment: requestedValue || undefined },
      expectedTargetNameSubstring: targetPhrase,
      structuredIntent: {
        intent: 'type',
        targetPhrase,
        roleHint: 'input',
        targetTokens: tokenizeSemanticText(targetPhrase),
        requestedValue,
        submitAfter: hasSubmitSuffix,
        pressEnter: hasSubmitSuffix,
        formAssignments: formAssignments.length > 0 ? formAssignments : undefined
      }
    };
  }

  // 4. Select option
  if (/(?:select|choose)(?:\s+(?:option))?/i.test(g)) {
    const selectMatch = g.match(/(?:select|choose)(?:\s+(?:option))?\s+["']?([^"']+)["']?(?:\s+(?:from|in)\s+(?:the\s+)?["']?([^"']+)["']?)?/i);
    const opt = selectMatch ? selectMatch[1].replace(/\?+$/, '').trim() : '';
    const targetPhrase = selectMatch && selectMatch[2] ? selectMatch[2].trim() : 'select';
    return {
      supported: true,
      goalPattern: 'select_option',
      expectedTerminal: { kind: 'select_changed', expectedOptionValue: opt || undefined },
      expectedTargetNameSubstring: targetPhrase,
      structuredIntent: {
        intent: 'select',
        targetPhrase,
        roleHint: 'select',
        targetTokens: tokenizeSemanticText(targetPhrase),
        requestedOption: opt
      }
    };
  }

  // 5. Explicit Scroll (supports "scroll", "scroll down", "scroll up", "page down")
  if (/scroll/i.test(g) || /page\s+(?:down|up)/i.test(g)) {
    const scrollMatch = g.match(/(?:scroll|page)\s*(down|up|top|bottom)?/i);
    const rawDir = scrollMatch && scrollMatch[1] ? scrollMatch[1].toLowerCase() : 'down';
    const dir = (rawDir === 'up' || rawDir === 'top' || rawDir === 'bottom') ? rawDir : 'down';
    return {
      supported: true,
      goalPattern: 'scroll',
      expectedTerminal: { kind: 'scroll_changed', direction: dir },
      structuredIntent: {
        intent: 'scroll',
        targetTokens: ['scroll']
      }
    };
  }

  // 6. Dismiss modal / banner
  if (/(?:dismiss|close|accept|reject|hide)\s+(?:cookie|banner|notice|modal|dialog|disclosure|popup|overlay)/i.test(g)) {
    return {
      supported: true,
      goalPattern: 'dismiss_modal',
      expectedTerminal: { kind: 'visibility_changed', state: 'hidden' },
      structuredIntent: {
        intent: 'dismiss',
        targetPhrase: 'close',
        roleHint: 'button',
        targetTokens: ['close', 'dismiss']
      }
    };
  }

  // 7. Approval / Protected Actions (Pay, Submit, Authorize, Release, Delete, Purge)
  if (/(?:approve|submit|pay|authorize|release|delete|order|purge|transfer)/i.test(g)) {
    return {
      supported: true,
      goalPattern: 'approval_submission',
      expectedTerminal: { kind: 'status_changed', statusId: 'approved' },
      expectedTargetNameSubstring: 'approve',
      structuredIntent: {
        intent: 'click',
        targetPhrase: 'approve',
        roleHint: 'button',
        targetTokens: ['approve', 'submit'],
        isProtected: true
      }
    };
  }

  // 7b. Drag and Drop
  const dragMatch = g.match(/^(?:(?:please|kindly)\s+)?drag\s+(.+?)\s+(?:to|onto|into|and\s+drop\s+(?:to|on|onto))\s+(.+)$/i);
  if (dragMatch) {
    const source = dragMatch[1].trim();
    const destination = dragMatch[2].trim();
    return {
      supported: true,
      goalPattern: 'drag_and_drop',
      expectedTerminal: { kind: 'status_changed' },
      expectedTargetNameSubstring: source,
      structuredIntent: {
        intent: 'drag_and_drop',
        targetPhrase: source,
        destinationPhrase: destination,
        targetTokens: tokenizeSemanticText(source)
      }
    };
  }

  // 7c. File Upload
  const uploadMatch = g.match(/^(?:(?:please|kindly)\s+)?(?:upload|attach)\s+(?:file|document|image)?\s*(.+?)(?:\s+(?:to|into|on)\s+(.+))?$/i);
  if (uploadMatch && (uploadMatch[1] || uploadMatch[2])) {
    const filePart = (uploadMatch[1] || '').trim();
    const targetPart = (uploadMatch[2] || '').trim();
    const targetPhrase = targetPart || 'upload';
    return {
      supported: true,
      goalPattern: 'upload_file',
      expectedTerminal: { kind: 'value_present', expectedValueFragment: filePart || undefined },
      expectedTargetNameSubstring: targetPhrase,
      structuredIntent: {
        intent: 'upload_file',
        targetPhrase,
        fileName: filePart || undefined,
        targetTokens: tokenizeSemanticText(targetPhrase)
      }
    };
  }

  // 7d. Hover
  const hoverMatch = g.match(/^(?:(?:please|kindly)\s+)?(?:hover(?:\s+over)?|mouse\s+over|move\s+mouse\s+to)\s+(?:on\s+)?(?:the\s+)?(.+?)(?:\s+(?:and|\bthen\b)\s+(.+))?$/i);
  if (hoverMatch) {
    const target = hoverMatch[1].trim();
    return {
      supported: true,
      goalPattern: 'hover_control',
      isMultiStep: isMultiStep || Boolean(hoverMatch[2]),
      expectedTerminal: { kind: 'status_changed' },
      expectedTargetNameSubstring: target,
      structuredIntent: {
        intent: 'hover',
        targetPhrase: target,
        targetTokens: tokenizeSemanticText(target)
      }
    };
  }

  // 8. Generic clicking / interactions / navigation (button, link, item, admin, finish, sanitize, navigate, go to, show, open, tap, expand, delete, remove, download, save, export)
  // Extracts target phrase, role hints, and contextual qualifiers (e.g. "Open View Details for SIH26003", "download Chandrayaan 3 brochure")
  const verbMatch = g.match(/^(?:(?:please|kindly)\s+)?(?:click|open|press|tap|show|expand|navigate\s+to|go\s+to|view|visit|explore|browse|delete|remove|download|save|export|fetch)\s+(?:on\s+)?(?:the\s+)?/i);
  const hasInteractionVerb = Boolean(verbMatch);
  let cleanStr = hasInteractionVerb ? g.replace(verbMatch![0], '').trim() : g;

  cleanStr = cleanStr.replace(/\s+(?:repeatedly|again|multiple\s+times|continuously|twice|until\s+done)\b/i, '').trim();

  let roleHint: ElementRole | undefined;
  if (/\b(?:link)\b/i.test(cleanStr)) roleHint = 'link';
  else if (/\b(?:button)\b/i.test(cleanStr)) roleHint = 'button';
  else if (/\b(?:tab)\b/i.test(cleanStr)) roleHint = 'tab';
  else if (/\b(?:pdf|brochure|report|document|dataset|file)\b/i.test(cleanStr)) roleHint = 'link';

  if (roleHint) {
    cleanStr = cleanStr.replace(new RegExp(`\\s+${roleHint}\\b`, 'i'), '').trim();
  }

  let contextPhrase: string | undefined;
  let targetPhrase: string | undefined = hasInteractionVerb ? cleanStr : undefined;

  const contextMatch = cleanStr.match(/^(.+?)\s+(?:for|in|of|under|associated\s+with)\s+([a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_-]+)*)$/i);
  if (contextMatch) {
    targetPhrase = contextMatch[1].trim();
    contextPhrase = cleanContextPhrase(contextMatch[2].trim());
  }

  const isNavOrLink = roleHint === 'link' || roleHint === 'tab' || /navigate|go\s+to|login|signin|statement|submission/i.test(g);
  const pathFragment = (targetPhrase || cleanStr || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');

  return {
    supported: true,
    goalPattern: 'click_control',
    isMultiStep,
    expectedTerminal: isNavOrLink && pathFragment
      ? { kind: 'url_changed', expectedPathFragment: pathFragment }
      : { kind: 'status_changed' },
    expectedTargetNameSubstring: targetPhrase,
    structuredIntent: {
      intent: 'click',
      targetPhrase: targetPhrase || (hasInteractionVerb ? cleanStr : undefined),
      roleHint,
      targetTokens: targetPhrase ? tokenizeSemanticText(targetPhrase) : (hasInteractionVerb ? tokenizeSemanticText(cleanStr) : []),
      contextPhrase
    }
  };
}

export interface AtomicActionProposal {
  readonly actionId: string;
  readonly kind: 'click' | 'hover' | 'type' | 'select' | 'drag_and_drop' | 'upload_file' | 'scroll' | 'wait' | 'observe' | 'extract' | 'answer' | 'navigate';
  readonly targetLocalId?: string;
  readonly destinationLocalId?: string;
  readonly textToType?: string;
  readonly selectOptionValue?: string;
  readonly scrollDirection?: 'up' | 'down' | 'top' | 'bottom';
  readonly pressEnter?: boolean;
  readonly fileName?: string;
  readonly rationale?: string;
  readonly url?: string;
  readonly targetUrl?: string;
  readonly createNewTab?: boolean;
}

export interface ActionProposal {
  readonly actionId: string;
  readonly objectiveId?: string;
  readonly kind: ActionKind;
  readonly targetLocalId?: string;
  readonly destinationLocalId?: string;
  readonly confidence: number;
  readonly risk: RiskLevel;
  readonly rationale: string;
  readonly expectedState?: string;
  readonly expectedPostcondition?: ExpectedPostcondition;
  readonly semanticMatchReason?: string;
  readonly fallbackStrategy?: RecoveryStrategy;
  readonly completionEvidence?: ReadonlyArray<ObjectiveEvidenceKind>;
  readonly textToType?: string;
  readonly fileName?: string;
  readonly fileData?: string;
  readonly mimeType?: string;
  readonly selectOptionValue?: string;
  readonly scrollDirection?: 'up' | 'down' | 'top' | 'bottom';
  readonly tabId?: number;
  readonly userApproved?: boolean;
  readonly pressEnter?: boolean;
  readonly extractedData?: string;
  readonly answerText?: string;
  readonly reply?: string;
  readonly message?: string;
  readonly reasoning?: string;
  readonly batchActions?: ReadonlyArray<AtomicActionProposal>;
  readonly userInputPrompt?: string;
  readonly inputKey?: string;
  readonly subTasks?: ReadonlyArray<any>;
  readonly coordinates?: readonly [number, number];
  readonly url?: string;
  readonly targetUrl?: string;
  readonly createNewTab?: boolean;
  readonly targetName?: string;
  readonly elementText?: string;
  readonly searchQuery?: string;
  readonly searchResults?: ReadonlyArray<any>;
}

export interface ActionExecutionResult {
  readonly actionId: string;
  readonly success: boolean;
  readonly timestamp: number;
  readonly message?: string;
  readonly semanticOutcomeVerified: boolean;
  readonly reasonCode?: string;
  readonly staleTarget?: boolean;
}

export interface ActionValidationResult {
  readonly isValid: boolean;
  readonly proposal?: ActionProposal;
  readonly errorMessage?: string;
}

export const ALLOWED_ACTION_PROPOSAL_KEYS = new Set([
  'actionId',
  'objectiveId',
  'kind',
  'targetLocalId',
  'destinationLocalId',
  'confidence',
  'risk',
  'rationale',
  'expectedState',
  'expectedPostcondition',
  'semanticMatchReason',
  'fallbackStrategy',
  'completionEvidence',
  'textToType',
  'fileName',
  'fileData',
  'mimeType',
  'selectOptionValue',
  'scrollDirection',
  'tabId',
  'userApproved',
  'pressEnter',
  'extractedData',
  'answerText',
  'reply',
  'message',
  'reasoning',
  'thought',
  'batchActions',
  'userInputPrompt',
  'inputKey',
  'subTasks',
  'coordinates',
  'url',
  'targetUrl',
  'createNewTab',
  'description',
  'targetName',
  'elementText',
  'searchQuery',
  'searchResults'
]);

export const ALLOWED_ATOMIC_ACTION_KEYS = new Set([
  'actionId',
  'kind',
  'targetLocalId',
  'destinationLocalId',
  'textToType',
  'selectOptionValue',
  'scrollDirection',
  'pressEnter',
  'fileName',
  'userInputPrompt',
  'inputKey',
  'reply',
  'reasoning',
  'rationale',
  'userApproved',
  'coordinates',
  'confidence',
  'risk',
  'prompt',
  'message',
  'thought',
  'url',
  'targetUrl',
  'createNewTab',
  'description',
  'searchQuery'
]);

const VALID_ACTION_KINDS = new Set([
  'observe',
  'navigate',
  'click',
  'hover',
  'type',
  'select',
  'drag_and_drop',
  'upload_file',
  'scroll',
  'wait',
  'extract',
  'answer',
  'request_user_confirmation',
  'request_user_input',
  'batch',
  'spawn_subagents',
  'web_search',
  'finish',
  'blocked'
]);

const VALID_RISK_LEVELS = new Set([
  'safe',
  'protected',
  'blocked'
]);

const VALID_SCROLL_DIRECTIONS = new Set([
  'up',
  'down',
  'top',
  'bottom'
]);

const PROHIBITED_PROPERTY_NAMES = new Set([
  '__proto__',
  'constructor',
  'prototype'
]);

const PROHIBITED_SCRIPT_PATTERNS = [
  /<script\b/i,
  /javascript:/i,
  /vbscript:/i,
  /data:text\/html/i,
  /\bon\w+\s*=/i,
  /\beval\s*\(/i,
  /\bexpression\s*\(/i
];

const PROHIBITED_URL_PATTERNS = [
  /https?:\/\//i,
  /ftp:\/\//i,
  /file:\/\//i,
  /ws:\/\//i,
  /wss:\/\//i,
  /blob:/i,
  /data:/i
];

const PROHIBITED_SELECTOR_PATTERNS = [
  /^\s*#/,
  /^\s*\./,
  /\/\//,
  /\bxpath\b/i,
  /\bcontains\s*\(/i,
  /\btext\s*\(\s*\)/i,
  /[[\]>+~:]/
];

const LOCAL_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;
const ACTION_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

function isPlainObject(val: any): boolean {
  if (!val || typeof val !== 'object' || Array.isArray(val)) {
    return false;
  }
  const proto = Object.getPrototypeOf(val);
  if (proto !== null && proto !== Object.prototype) {
    return false;
  }
  if (Object.getOwnPropertySymbols(val).length > 0) {
    return false;
  }
  return true;
}

function hasProhibitedScriptPattern(str: string): boolean {
  return PROHIBITED_SCRIPT_PATTERNS.some((p) => p.test(str));
}

function hasProhibitedUrlPattern(str: string): boolean {
  return PROHIBITED_URL_PATTERNS.some((p) => p.test(str));
}

function hasProhibitedSelectorPattern(str: string): boolean {
  return PROHIBITED_SELECTOR_PATTERNS.some((p) => p.test(str));
}

/**
 * Validates an ActionProposal against strict closed runtime schema and optional context elements.
 */
export function validateActionProposal(
  proposal: any,
  validElements?: ReadonlyArray<SanitizedElement>
): ActionValidationResult {
  if (!isPlainObject(proposal)) {
    return { isValid: false, errorMessage: 'Action proposal must be a JSON object' };
  }

  // 1. Closed Schema: Reject unknown and prototype-pollution keys
  const keys = Object.getOwnPropertyNames(proposal);
  for (const k of keys) {
    if (PROHIBITED_PROPERTY_NAMES.has(k) || !ALLOWED_ACTION_PROPOSAL_KEYS.has(k)) {
      return { isValid: false, errorMessage: `Closed schema violation: Unknown action property: "${k}"` };
    }
  }

  // 2. actionId
  if (typeof proposal.actionId !== 'string' || !ACTION_ID_REGEX.test(proposal.actionId)) {
    return { isValid: false, errorMessage: 'Invalid or missing "actionId"' };
  }
  if (hasProhibitedScriptPattern(proposal.actionId) || hasProhibitedUrlPattern(proposal.actionId)) {
    return { isValid: false, errorMessage: 'actionId contains prohibited script or URL patterns' };
  }

  if (proposal.objectiveId !== undefined && (typeof proposal.objectiveId !== 'string' || !ACTION_ID_REGEX.test(proposal.objectiveId))) {
    return { isValid: false, errorMessage: 'Invalid "objectiveId"' };
  }

  // 3. kind
  if (typeof proposal.kind !== 'string' || !VALID_ACTION_KINDS.has(proposal.kind)) {
    return { isValid: false, errorMessage: 'Invalid or unsupported action kind' };
  }

  // 4. confidence
  if (
    typeof proposal.confidence !== 'number' ||
    !Number.isFinite(proposal.confidence) ||
    Number.isNaN(proposal.confidence) ||
    proposal.confidence < 0 ||
    proposal.confidence > 1
  ) {
    return { isValid: false, errorMessage: 'Field "confidence" must be a finite number between 0 and 1' };
  }

  // 5. risk
  if (typeof proposal.risk !== 'string' || !VALID_RISK_LEVELS.has(proposal.risk)) {
    return { isValid: false, errorMessage: 'Invalid or missing "risk" level' };
  }

  // 6. rationale
  if (typeof proposal.rationale !== 'string' || proposal.rationale.length > 1000) {
    return { isValid: false, errorMessage: 'Field "rationale" must be a string up to 1000 characters' };
  }
  if (hasProhibitedScriptPattern(proposal.rationale) || hasProhibitedUrlPattern(proposal.rationale)) {
    return { isValid: false, errorMessage: 'rationale contains prohibited script or URL patterns' };
  }

  // 6b. reasoning
  if (proposal.reasoning !== undefined) {
    if (typeof proposal.reasoning !== 'string' || proposal.reasoning.length > 5000) {
      return { isValid: false, errorMessage: 'Field "reasoning" must be a string up to 5000 characters' };
    }
    if (hasProhibitedScriptPattern(proposal.reasoning) || hasProhibitedUrlPattern(proposal.reasoning)) {
      return { isValid: false, errorMessage: 'reasoning contains prohibited script or URL patterns' };
    }
  }

  // 6c. reply
  if (proposal.reply !== undefined) {
    if (typeof proposal.reply !== 'string' || proposal.reply.length > 5000) {
      return { isValid: false, errorMessage: 'Field "reply" must be a string up to 5000 characters' };
    }
    if (hasProhibitedScriptPattern(proposal.reply) || hasProhibitedUrlPattern(proposal.reply)) {
      return { isValid: false, errorMessage: 'reply contains prohibited script or URL patterns' };
    }
  }

  if (proposal.semanticMatchReason !== undefined && (typeof proposal.semanticMatchReason !== 'string' || proposal.semanticMatchReason.length > 1000 || hasProhibitedScriptPattern(proposal.semanticMatchReason) || hasProhibitedUrlPattern(proposal.semanticMatchReason))) {
    return { isValid: false, errorMessage: 'Field "semanticMatchReason" must be a safe string up to 1000 characters' };
  }
  if (proposal.fallbackStrategy !== undefined) {
    const allowedFallbacks = new Set(['reperceive', 'wait_for_hydration', 'retry_target', 'scroll_to_target', 'navigate_fallback', 'refresh_once', 'request_user_input', 'fail_safe']);
    if (typeof proposal.fallbackStrategy !== 'string' || !allowedFallbacks.has(proposal.fallbackStrategy)) {
      delete (proposal as any).fallbackStrategy;
    }
  }
  if (proposal.completionEvidence !== undefined) {
    const allowedEvidence = new Set(['url', 'element', 'text', 'input_value', 'dialog', 'attribute', 'scroll', 'visual_change']);
    if (Array.isArray(proposal.completionEvidence)) {
      proposal.completionEvidence = proposal.completionEvidence
        .map((item: any) => typeof item === 'string' ? item.trim().toLowerCase() : '')
        .filter((item: string) => allowedEvidence.has(item));
      if (proposal.completionEvidence.length === 0) {
        delete (proposal as any).completionEvidence;
      }
    } else if (typeof proposal.completionEvidence === 'string' && allowedEvidence.has(proposal.completionEvidence.trim().toLowerCase())) {
      proposal.completionEvidence = [proposal.completionEvidence.trim().toLowerCase()];
    } else {
      delete (proposal as any).completionEvidence;
    }
  }

  // 7. expectedState
  if (proposal.expectedState !== undefined) {
    if (typeof proposal.expectedState !== 'string' || proposal.expectedState.length > 500) {
      return { isValid: false, errorMessage: 'Field "expectedState" must be a string up to 500 characters' };
    }
    if (hasProhibitedScriptPattern(proposal.expectedState) || hasProhibitedUrlPattern(proposal.expectedState)) {
      return { isValid: false, errorMessage: 'expectedState contains prohibited script or URL patterns' };
    }
  }

  // 7b. expectedPostcondition (structured closed schema, no arbitrary scripts/selectors)
  if (proposal.expectedPostcondition !== undefined) {
    if (typeof proposal.expectedPostcondition !== 'object' || proposal.expectedPostcondition === null || Array.isArray(proposal.expectedPostcondition)) {
      return { isValid: false, errorMessage: 'Field "expectedPostcondition" must be a structured object' };
    }
    const pc = proposal.expectedPostcondition as any;
    const allowedKinds = new Set([
      'dialog_visible',
      'panel_visible',
      'element_visible',
      'element_count_changed',
      'visual_change',
      'map_location_changed',
      'search_results_visible',
      'content_visible',
      'url_changed',
      'attribute_changed',
      'value_present',
      'select_changed',
      'status_changed',
      'scroll_changed',
      'visibility_changed',
      'answer_supported'
    ]);
    if (!allowedKinds.has(pc.kind)) {
      return { isValid: false, errorMessage: `Invalid expectedPostcondition kind "${pc.kind}"` };
    }
    const allowedPostconditionKeys: Record<string, ReadonlySet<string>> = {
      dialog_visible: new Set(['kind', 'dialogId']),
      panel_visible: new Set(['kind', 'namePattern']),
      element_visible: new Set(['kind', 'targetLocalId', 'namePattern']),
      element_count_changed: new Set(['kind', 'minimumDelta']),
      visual_change: new Set(['kind', 'minimumChangeRatio']),
      map_location_changed: new Set(['kind', 'locationPattern']),
      search_results_visible: new Set(['kind', 'queryPattern']),
      content_visible: new Set(['kind', 'textPattern']),
      url_changed: new Set(['kind', 'expectedPathFragment']),
      attribute_changed: new Set(['kind', 'attributeName', 'expectedValue']),
      value_present: new Set(['kind', 'expectedValueFragment']),
      select_changed: new Set(['kind', 'expectedOptionValue']),
      status_changed: new Set(['kind', 'statusId']),
      scroll_changed: new Set(['kind', 'direction']),
      visibility_changed: new Set(['kind', 'targetLocalId', 'state']),
      answer_supported: new Set(['kind', 'queryTopic'])
    };
    for (const key of Object.getOwnPropertyNames(pc)) {
      if (PROHIBITED_PROPERTY_NAMES.has(key) || !allowedPostconditionKeys[pc.kind]?.has(key)) {
        return { isValid: false, errorMessage: `Closed schema violation: Unknown expectedPostcondition property "${key}"` };
      }
    }
    if (pc.minimumDelta !== undefined && (typeof pc.minimumDelta !== 'number' || !Number.isFinite(pc.minimumDelta) || pc.minimumDelta < 1)) {
      return { isValid: false, errorMessage: 'minimumDelta must be a positive finite number' };
    }
    if (pc.minimumChangeRatio !== undefined && (typeof pc.minimumChangeRatio !== 'number' || !Number.isFinite(pc.minimumChangeRatio) || pc.minimumChangeRatio < 0 || pc.minimumChangeRatio > 1)) {
      return { isValid: false, errorMessage: 'minimumChangeRatio must be between 0 and 1' };
    }
    if (pc.kind === 'attribute_changed') {
      const allowedAttrs = new Set(['aria-expanded', 'aria-checked', 'aria-selected', 'disabled', 'open', 'class']);
      if (!allowedAttrs.has(pc.attributeName)) {
        return { isValid: false, errorMessage: `Prohibited or untrusted attributeName "${pc.attributeName}" in postcondition` };
      }
    }
    if (pc.kind === 'scroll_changed') {
      const allowedDirs = new Set(['up', 'down', 'top', 'bottom']);
      if (!allowedDirs.has(pc.direction)) {
        return { isValid: false, errorMessage: `Invalid scroll direction "${pc.direction}" in postcondition` };
      }
    }
    if (pc.kind === 'visibility_changed') {
      if (pc.state !== 'visible' && pc.state !== 'hidden') {
        return { isValid: false, errorMessage: `Invalid visibility state "${pc.state}" in postcondition` };
      }
    }
    for (const [key, val] of Object.entries(pc)) {
      if (typeof val === 'string') {
        if (hasProhibitedScriptPattern(val) || hasProhibitedUrlPattern(val) || hasProhibitedSelectorPattern(val)) {
          return { isValid: false, errorMessage: `Postcondition field "${key}" contains prohibited script, URL, or selector pattern` };
        }
      }
    }
  }

  // 8. scrollDirection
  if (proposal.scrollDirection !== undefined) {
    if (typeof proposal.scrollDirection !== 'string' || !VALID_SCROLL_DIRECTIONS.has(proposal.scrollDirection)) {
      return { isValid: false, errorMessage: 'Field "scrollDirection" must be one of "up", "down", "top", "bottom"' };
    }
  }

  // 8b. destinationLocalId
  if (proposal.destinationLocalId !== undefined) {
    if (typeof proposal.destinationLocalId !== 'string' || !LOCAL_ID_REGEX.test(proposal.destinationLocalId) || hasProhibitedSelectorPattern(proposal.destinationLocalId)) {
      return { isValid: false, errorMessage: 'Invalid destinationLocalId format. Raw selectors and script patterns prohibited' };
    }
  }

  // 8c. tabId
  if (proposal.tabId !== undefined) {
    if (typeof proposal.tabId !== 'number' || !Number.isInteger(proposal.tabId) || proposal.tabId < 0) {
      return { isValid: false, errorMessage: 'Field "tabId" must be a non-negative integer' };
    }
  }

  // 8d. fileName, fileData, mimeType
  if (proposal.fileName !== undefined) {
    if (typeof proposal.fileName !== 'string' || proposal.fileName.length === 0 || proposal.fileName.length > 255) {
      return { isValid: false, errorMessage: 'Field "fileName" must be a non-empty string up to 255 characters' };
    }
    if (hasProhibitedScriptPattern(proposal.fileName) || proposal.fileName.includes('..') || proposal.fileName.includes('/') || proposal.fileName.includes('\\')) {
      return { isValid: false, errorMessage: 'Field "fileName" contains invalid or prohibited patterns' };
    }
  }
  if (proposal.fileData !== undefined) {
    if (typeof proposal.fileData !== 'string' || proposal.fileData.length > 5 * 1024 * 1024) {
      return { isValid: false, errorMessage: 'Field "fileData" must be a string up to 5MB' };
    }
  }
  if (proposal.mimeType !== undefined) {
    if (typeof proposal.mimeType !== 'string' || proposal.mimeType.length > 100 || !/^[a-zA-Z0-9.+/-]+$/.test(proposal.mimeType)) {
      return { isValid: false, errorMessage: 'Field "mimeType" must be a valid MIME string up to 100 characters' };
    }
  }

  // 9. targetLocalId & action-specific requirements
  const kind = proposal.kind as ActionKind;

  if (proposal.targetLocalId !== undefined) {
    if (typeof proposal.targetLocalId !== 'string' || !LOCAL_ID_REGEX.test(proposal.targetLocalId) || hasProhibitedSelectorPattern(proposal.targetLocalId)) {
      return { isValid: false, errorMessage: 'Invalid targetLocalId format. Raw selectors and script patterns prohibited' };
    }
  }

  // coordinates validation
  if (proposal.coordinates !== undefined) {
    if (!Array.isArray(proposal.coordinates) || proposal.coordinates.length !== 2 || typeof proposal.coordinates[0] !== 'number' || typeof proposal.coordinates[1] !== 'number') {
      return { isValid: false, errorMessage: 'Field "coordinates" must be a tuple of two numbers [x, y]' };
    }
  }

  // Actions requiring targetLocalId (click can alternatively use coordinates)
  if (kind === 'click' || kind === 'hover' || kind === 'type' || kind === 'select' || kind === 'upload_file') {
    if ((!proposal.targetLocalId || typeof proposal.targetLocalId !== 'string') && !(kind === 'click' && Array.isArray(proposal.coordinates) && proposal.coordinates.length === 2)) {
      return { isValid: false, errorMessage: `Action kind "${kind}" requires a valid "targetLocalId"` };
    }
  }

  // drag_and_drop requirements
  if (kind === 'drag_and_drop') {
    if (!proposal.targetLocalId || typeof proposal.targetLocalId !== 'string') {
      return { isValid: false, errorMessage: 'Action kind "drag_and_drop" requires a valid "targetLocalId"' };
    }
    if (!proposal.destinationLocalId || typeof proposal.destinationLocalId !== 'string') {
      return { isValid: false, errorMessage: 'Action kind "drag_and_drop" requires a valid "destinationLocalId"' };
    }
  }

  // upload_file requirements
  if (kind === 'upload_file') {
    if (!proposal.fileName || typeof proposal.fileName !== 'string') {
      return { isValid: false, errorMessage: 'Action kind "upload_file" requires a valid "fileName"' };
    }
  }

  // Type action requirements
  if (kind === 'type') {
    if (typeof proposal.textToType !== 'string' || proposal.textToType.length === 0 || proposal.textToType.length > 500) {
      return { isValid: false, errorMessage: 'Action kind "type" requires "textToType" string between 1 and 500 characters' };
    }
    if (hasProhibitedScriptPattern(proposal.textToType)) {
      return { isValid: false, errorMessage: 'textToType contains prohibited script patterns' };
    }
  } else if (proposal.textToType !== undefined) {
    if (typeof proposal.textToType !== 'string' || proposal.textToType.length > 500) {
      return { isValid: false, errorMessage: 'Field "textToType" must be a string up to 500 characters' };
    }
    if (hasProhibitedScriptPattern(proposal.textToType)) {
      return { isValid: false, errorMessage: 'textToType contains prohibited script patterns' };
    }
  }

  // Select action requirements
  if (kind === 'select') {
    if (typeof proposal.selectOptionValue !== 'string' || proposal.selectOptionValue.length === 0 || proposal.selectOptionValue.length > 200) {
      return { isValid: false, errorMessage: 'Action kind "select" requires "selectOptionValue" string between 1 and 200 characters' };
    }
    if (hasProhibitedScriptPattern(proposal.selectOptionValue)) {
      return { isValid: false, errorMessage: 'selectOptionValue contains prohibited script patterns' };
    }
  } else if (proposal.selectOptionValue !== undefined) {
    if (typeof proposal.selectOptionValue !== 'string' || proposal.selectOptionValue.length > 200) {
      return { isValid: false, errorMessage: 'Field "selectOptionValue" must be a string up to 200 characters' };
    }
    if (hasProhibitedScriptPattern(proposal.selectOptionValue)) {
      return { isValid: false, errorMessage: 'selectOptionValue contains prohibited script patterns' };
    }
  }

  // Navigate action requirements
  if (kind === 'navigate') {
    const navUrl = proposal.url || proposal.targetUrl;
    if (typeof navUrl !== 'string' || navUrl.length === 0 || navUrl.length > 2000) {
      return { isValid: false, errorMessage: 'Action kind "navigate" requires a valid "url" or "targetUrl" (up to 2000 chars)' };
    }
    if (hasProhibitedScriptPattern(navUrl)) {
      return { isValid: false, errorMessage: 'navigate url contains prohibited script patterns' };
    }
  } else if (proposal.url !== undefined) {
    if (typeof proposal.url !== 'string' || proposal.url.length > 2000 || hasProhibitedScriptPattern(proposal.url)) {
      return { isValid: false, errorMessage: 'Field "url" must be a valid string up to 2000 characters without scripts' };
    }
  } else if (proposal.targetUrl !== undefined) {
    if (typeof proposal.targetUrl !== 'string' || proposal.targetUrl.length > 2000 || hasProhibitedScriptPattern(proposal.targetUrl)) {
      return { isValid: false, errorMessage: 'Field "targetUrl" must be a valid string up to 2000 characters without scripts' };
    }
  }
  if (proposal.createNewTab !== undefined && typeof proposal.createNewTab !== 'boolean') {
    return { isValid: false, errorMessage: 'Field "createNewTab" must be a boolean' };
  }

  // 9a-search. web_search action validation
  if (kind === 'web_search') {
    const query = proposal.searchQuery;
    if (typeof query !== 'string' || query.length === 0 || query.length > 500) {
      return { isValid: false, errorMessage: 'Action kind "web_search" requires a valid "searchQuery" string (1-500 chars)' };
    }
    if (hasProhibitedScriptPattern(query)) {
      return { isValid: false, errorMessage: 'searchQuery contains prohibited script patterns' };
    }
  } else if (proposal.searchQuery !== undefined) {
    if (typeof proposal.searchQuery !== 'string' || proposal.searchQuery.length > 500 || hasProhibitedScriptPattern(proposal.searchQuery)) {
      return { isValid: false, errorMessage: 'Field "searchQuery" must be a string up to 500 characters' };
    }
  }
  if (proposal.searchResults !== undefined && !Array.isArray(proposal.searchResults)) {
    return { isValid: false, errorMessage: 'Field "searchResults" must be an array' };
  }

  // 9b. userApproved & pressEnter validation
  if (proposal.userApproved !== undefined && typeof proposal.userApproved !== 'boolean') {
    return { isValid: false, errorMessage: 'Field "userApproved" must be a boolean' };
  }
  if (proposal.pressEnter !== undefined && typeof proposal.pressEnter !== 'boolean') {
    return { isValid: false, errorMessage: 'Field "pressEnter" must be a boolean' };
  }

  // 9c. userInputPrompt & inputKey validation (Interactive slot-filling)
  if (proposal.userInputPrompt !== undefined) {
    if (typeof proposal.userInputPrompt !== 'string' || proposal.userInputPrompt.length > 500) {
      return { isValid: false, errorMessage: 'Field "userInputPrompt" must be a string up to 500 characters' };
    }
    if (hasProhibitedScriptPattern(proposal.userInputPrompt) || hasProhibitedUrlPattern(proposal.userInputPrompt)) {
      return { isValid: false, errorMessage: 'userInputPrompt contains prohibited script or URL patterns' };
    }
  }
  if (proposal.inputKey !== undefined) {
    if (typeof proposal.inputKey !== 'string' || proposal.inputKey.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(proposal.inputKey)) {
      return { isValid: false, errorMessage: 'Field "inputKey" must be a valid identifier up to 100 characters' };
    }
  }

  // 9d. batch & batchActions validation (Multi-action planning)
  if (kind === 'batch') {
    if (!Array.isArray(proposal.batchActions) || proposal.batchActions.length === 0) {
      return { isValid: false, errorMessage: 'Action kind "batch" requires a non-empty "batchActions" array' };
    }
  }

  if (proposal.batchActions !== undefined) {
    if (!Array.isArray(proposal.batchActions)) {
      return { isValid: false, errorMessage: 'Field "batchActions" must be an array' };
    }
    if (proposal.batchActions.length === 0 || proposal.batchActions.length > 10) {
      return { isValid: false, errorMessage: 'Field "batchActions" must contain between 1 and 10 actions' };
    }

    const VALID_ATOMIC_KINDS = new Set([
      'click',
      'hover',
      'type',
      'select',
      'drag_and_drop',
      'upload_file',
      'scroll',
      'wait',
      'observe',
      'extract',
      'answer',
      'request_user_input',
      'navigate'
    ]);

    for (let i = 0; i < proposal.batchActions.length; i++) {
      const sub = proposal.batchActions[i];
      if (!isPlainObject(sub)) {
        return { isValid: false, errorMessage: `batchActions[${i}] must be a JSON object` };
      }
      for (const k of Object.getOwnPropertyNames(sub)) {
        if (PROHIBITED_PROPERTY_NAMES.has(k) || !ALLOWED_ATOMIC_ACTION_KEYS.has(k)) {
          return { isValid: false, errorMessage: `Closed schema violation: Unknown property "${k}" in batchActions[${i}]` };
        }
      }
      if (typeof sub.actionId !== 'string' || !ACTION_ID_REGEX.test(sub.actionId)) {
        return { isValid: false, errorMessage: `Invalid actionId in batchActions[${i}]` };
      }
      if (typeof sub.kind !== 'string' || !VALID_ATOMIC_KINDS.has(sub.kind)) {
        return { isValid: false, errorMessage: `Invalid kind "${sub.kind}" in batchActions[${i}]` };
      }
      if (sub.targetLocalId !== undefined) {
        if (typeof sub.targetLocalId !== 'string' || !LOCAL_ID_REGEX.test(sub.targetLocalId) || hasProhibitedSelectorPattern(sub.targetLocalId)) {
          return { isValid: false, errorMessage: `Invalid targetLocalId in batchActions[${i}]` };
        }
      }
      if (['click', 'hover', 'type', 'select', 'upload_file'].includes(sub.kind) && !sub.targetLocalId) {
        return { isValid: false, errorMessage: `batchActions[${i}] kind "${sub.kind}" requires targetLocalId` };
      }
      if (sub.kind === 'type') {
        if (typeof sub.textToType !== 'string' || sub.textToType.length === 0 || sub.textToType.length > 500) {
          return { isValid: false, errorMessage: `batchActions[${i}] type action requires textToType (1-500 chars)` };
        }
        if (hasProhibitedScriptPattern(sub.textToType)) {
          return { isValid: false, errorMessage: `batchActions[${i}] textToType contains prohibited script patterns` };
        }
      }
      if (sub.kind === 'select') {
        if (typeof sub.selectOptionValue !== 'string' || sub.selectOptionValue.length === 0 || sub.selectOptionValue.length > 200) {
          return { isValid: false, errorMessage: `batchActions[${i}] select action requires selectOptionValue` };
        }
        if (hasProhibitedScriptPattern(sub.selectOptionValue)) {
          return { isValid: false, errorMessage: `batchActions[${i}] selectOptionValue contains prohibited script patterns` };
        }
      }
      if (sub.kind === 'navigate') {
        const subUrl = sub.url || sub.targetUrl;
        if (typeof subUrl !== 'string' || subUrl.length === 0 || subUrl.length > 2000) {
          return { isValid: false, errorMessage: `batchActions[${i}] navigate action requires "url" or "targetUrl"` };
        }
        if (hasProhibitedScriptPattern(subUrl)) {
          return { isValid: false, errorMessage: `batchActions[${i}] url contains prohibited script patterns` };
        }
      }
      if (sub.scrollDirection !== undefined && !VALID_SCROLL_DIRECTIONS.has(sub.scrollDirection)) {
        return { isValid: false, errorMessage: `Invalid scrollDirection in batchActions[${i}]` };
      }
      if (sub.rationale !== undefined && (typeof sub.rationale !== 'string' || sub.rationale.length > 500)) {
        return { isValid: false, errorMessage: `Invalid rationale in batchActions[${i}]` };
      }
      if (validElements && sub.targetLocalId) {
        const found = validElements.find((e) => e.localId === sub.targetLocalId);
        if (!found) {
          return { isValid: false, errorMessage: `batchActions[${i}] target element "${sub.targetLocalId}" not found in context` };
        }
      }
    }
  }

  // 10. Context & Capability Validation against Sanitized Elements (if supplied)
  if (validElements) {
    if (proposal.targetLocalId) {
      const targetElement = validElements.find((e) => e.localId === proposal.targetLocalId);
      if (!targetElement) {
        return {
          isValid: false,
          errorMessage: 'Target element with localId not found in sanitized context'
        };
      }

      // Check capabilities (if element declares actionCapabilities)
      const caps = targetElement.actionCapabilities || [];
      if (caps.length > 0) {
        if (kind === 'click' && !caps.includes('click')) {
          return {
            isValid: false,
            errorMessage: 'Target element does not support "click" action capability'
          };
        }

        if (kind === 'type' && !caps.includes('type')) {
          return {
            isValid: false,
            errorMessage: 'Target element does not support "type" action capability'
          };
        }

        if (kind === 'select' && !caps.includes('select')) {
          return {
            isValid: false,
            errorMessage: 'Target element does not support "select" action capability'
          };
        }

        if (kind === 'hover' && !caps.includes('hover') && !caps.includes('click')) {
          return {
            isValid: false,
            errorMessage: 'Target element does not support "hover" action capability'
          };
        }

        if (kind === 'drag_and_drop' && !caps.includes('drag') && !caps.includes('click')) {
          return {
            isValid: false,
            errorMessage: 'Target element does not support "drag" action capability'
          };
        }

        if (kind === 'upload_file' && !caps.includes('upload') && !caps.includes('type')) {
          return {
            isValid: false,
            errorMessage: 'Target element does not support "upload" action capability'
          };
        }
      }
    }

    if (proposal.destinationLocalId) {
      const destElement = validElements.find((e) => e.localId === proposal.destinationLocalId);
      if (!destElement) {
        return {
          isValid: false,
          errorMessage: 'Destination element with destinationLocalId not found in sanitized context'
        };
      }
    }
  }

  return {
    isValid: true,
    proposal: proposal as ActionProposal
  };
}

/**
 * Validates whether an action proposed by the reasoning server is safe to auto-execute.
 */
export function classifyActionRisk(
  proposal: ActionProposal,
  elementName?: string
): RiskLevel {
  const kind = proposal.kind;
  const name = (elementName || '').toLowerCase();

  // Hard blocked categories
  if (
    name.includes('password') ||
    name.includes('otp') ||
    name.includes('captcha') ||
    name.includes('cvv') ||
    name.includes('pin') ||
    (kind === 'type' && (
      name.includes('payment') ||
      name.includes('card') ||
      name.includes('token') ||
      name.includes('secret') ||
      name.includes('sensitive') ||
      name.includes('national id') ||
      name.includes('aadhaar') ||
      name.includes('pan') ||
      name.includes('ssn')
    ))
  ) {
    return 'blocked';
  }

  // Explicitly user-approved actions (prompt authorized or modal confirmed)
  if (proposal.userApproved) {
    return 'safe';
  }

  // Request user input is safe (local dialog prompt)
  if (kind === 'request_user_input') {
    return 'safe';
  }

  // Batch action risk: evaluated against all sub-actions
  if (kind === 'batch' && proposal.batchActions && proposal.batchActions.length > 0) {
    let hasProtected = false;
    for (const sub of proposal.batchActions) {
      const subTarget = (sub.targetLocalId || '').toLowerCase();
      const subRationale = (sub.rationale || '').toLowerCase();
      if (
        subTarget.includes('password') ||
        subTarget.includes('otp') ||
        subTarget.includes('captcha') ||
        subTarget.includes('cvv') ||
        subTarget.includes('pin') ||
        (sub.kind === 'type' && (
          subTarget.includes('payment') ||
          subTarget.includes('card') ||
          subTarget.includes('token') ||
          subTarget.includes('secret')
        ))
      ) {
        return 'blocked';
      }
      if (
        sub.kind === 'upload_file' ||
        subTarget.includes('submit') ||
        subTarget.includes('send') ||
        subTarget.includes('publish') ||
        subTarget.includes('delete') ||
        subTarget.includes('pay') ||
        subRationale.includes('submit') ||
        subRationale.includes('delete') ||
        subRationale.includes('pay')
      ) {
        hasProtected = true;
      }
    }
    return hasProtected ? 'protected' : 'safe';
  }

  // Upload file is protected by default unless explicitly user approved
  if (kind === 'upload_file') {
    return 'protected';
  }

  // Hover is safe
  if (kind === 'hover') {
    return 'safe';
  }

  // Protected actions requiring human confirmation
  if (
    kind === 'request_user_confirmation' ||
    name.includes('submit') ||
    name.includes('send') ||
    name.includes('publish') ||
    name.includes('delete') ||
    name.includes('remove') ||
    name.includes('pay') ||
    name.includes('purchase') ||
    name.includes('buy') ||
    name.includes('authorize') ||
    name.includes('sign') ||
    name.includes('transfer') ||
    name.includes('confirm order')
  ) {
    return 'protected';
  }

  // Drag and drop is safe unless target or action was protected above
  if (kind === 'drag_and_drop') {
    return proposal.risk || 'safe';
  }

  // Safe reversible actions
  if (
    kind === 'observe' ||
    kind === 'wait' ||
    kind === 'scroll' ||
    kind === 'select' ||
    (kind === 'click' && (name.includes('preview') || name.includes('filter') || name.includes('view') || name.includes('tab') || name.includes('next') || name.includes('search') || name.includes('close') || name.includes('cancel'))) ||
    kind === 'type'
  ) {
    return 'safe';
  }

  return proposal.risk || 'protected';
}

/**
 * Strips leading navigation clauses from compound goals (e.g. "open bhuvan and explore earth observation" -> "explore earth observation")
 */
export function stripNavigationPrefixFromGoal(goal: string): string {
  if (!goal || typeof goal !== 'string') return goal;
  const match = goal.trim().match(/^(?:(?:please|kindly)\s+)?(?:(?:in|on|open)\s+(?:a\s+)?(?:new|another|fresh)\s+tab(?:,\s*|\s+and\s+)?)?(?:open|go\s+to|visit|launch|load|navigate\s+to)\s+(?:https?:\/\/[^\s,]+|[a-zA-Z0-9_.-]+?)(?:,\s*|\s+(?:and\s+then|then|after\s+that|and|to|for)\s*|\s+and\s*,\s*)(.+)$/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  return goal.trim();
}

/**
 * Detects if a user instruction is purely a navigation request without trailing action directives.
 * E.g. "open gmail.com", "go to sih.gov.in", "https://isro.gov.in", "navigate to github.com"
 */
export function isPureNavigationGoal(goal: string): boolean {
  if (!goal || typeof goal !== 'string') return false;
  let g = goal.trim().toLowerCase();
  const ACTION_PREFIX_REGEX = /^(?:(?:please|kindly)\s+|(?:can|could|would|will)\s+(?:you|we)\s+|(?:i\s+(?:want|need|would\s+like)\s+(?:you\s+)?to)\s+|(?:go\s+ahead\s+and)\s+|(?:hey|hi|ok)\s+(?:privapilot[,!]?\s+)?(?:please\s+)?|(?:do\s+(?:the\s+)?|perform\s+(?:the\s+)?|start\s+(?:the\s+)?|execute\s+(?:the\s+)?|proceed\s+with\s+(?:the\s+)?|try\s+to\s+|let's\s+|lets\s+|let\s+us\s+)|(?:help\s+me\s+(?:in\s+|with\s+|out\s+with\s+|to\s+|by\s+|on\s+)?|assist\s+me\s+(?:in\s+|with\s+|to\s+)?)|(?:and\s+then|then|after\s+that|and|also|now|next|so)\s+)+/i;
  let prev = '';
  while (g && g !== prev) {
    prev = g;
    g = g.replace(ACTION_PREFIX_REGEX, '').trim();
  }

  // If a compound action continuation follows, it is NOT pure navigation
  if (/\s+(?:and\s+then|then|after\s+that|and|,)\s+(?:click|type|fill|enter|search|filter|find|select|press|check|see|tell|scroll|hover|drag|drop|upload)\b/i.test(g)) {
    return false;
  }

  // Check if it is directly a URL or domain
  if (/^https?:\/\/[^\s]+$/i.test(g) || /^www\.[a-z0-9-]+\.[a-z]+(?:\/[^\s]*)?$/i.test(g)) {
    return true;
  }
  if (/^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,24}(?:\/[^\s]*)?$/i.test(g)) {
    return true;
  }

  // Check pure navigation verb + target (e.g. "open gmail.com", "go to github.com", "open isro")
  const navMatch = g.match(/^(?:open|go\s+to|visit|launch|load|navigate\s+to)\s+([a-zA-Z0-9_.:/-]+)$/i);
  if (navMatch) {
    const target = navMatch[1].trim();
    if (/https?:\/\/|www\.|\.[a-z]{2,}/i.test(target)) return true;
    if (/^(?:gmail|google|isro|sih|github|youtube|reddit|wikipedia|duckduckgo|demo|portal)$/i.test(target)) return true;
  }

  return false;
}

