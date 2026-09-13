import { SanitizedElement, ElementRole } from './payload.js';
import {
  StructuredTaskIntent,
  FormFieldAssignment,
  tokenizeSemanticText,
  normalizeSemanticText
} from './grounding.js';

export type ActionKind =
  | 'observe'
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
  | 'finish'
  | 'blocked';

export type RiskLevel = 'safe' | 'protected' | 'blocked';

export type ExpectedPostcondition =
  | { readonly kind: 'dialog_visible'; readonly dialogId?: string }
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
  const ACTION_PREFIX_REGEX = /^(?:(?:please|kindly)\s+|(?:can|could|would|will)\s+you\s+|(?:i\s+(?:want|need)\s+you\s+to)\s+|(?:go\s+ahead\s+and)\s+|(?:hey|hi)\s+(?:privapilot[,!]?\s+)?(?:please\s+)?|(?:do\s+(?:the\s+)?|perform\s+(?:the\s+)?|start\s+(?:the\s+)?|execute\s+(?:the\s+)?|proceed\s+with\s+(?:the\s+)?|try\s+to\s+)|(?:and\s+then|then|after\s+that|and|also|now|next|so)\s+)+/i;
  while (g && g !== prev) {
    prev = g;
    g = g.replace(ACTION_PREFIX_REGEX, '').trim();
  }

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

  // Explicit out-of-domain rejection
  if (/(?:poem|story|recipe|joke|capital of|calculate|solve math|2\+2|weather|song|quantum)/i.test(g)) {
    return {
      supported: false,
      goalPattern: 'out_of_domain',
      expectedTerminal: { kind: 'status_changed' },
      abstentionReason: 'UNSUPPORTED_TASK_GOAL: Goal is outside closed supported browser task contracts; abstaining safely.'
    };
  }

  // 1a. Information retrieval & question-answering goals (e.g. "how many submissions are done", "tell me how many submissions are completed", "see for ex how many submissions...")
  const isQuestionOrRetrieval =
    /(?:how\s+many|count\s+(?:of|for)|number\s+of|total\s+(?:count|number|submissions?)|submissions?\s+(?:are\s+)?(?:done|completed|submitted)|what\s+is\s+the\s+(?:count|number|total|status)|which\s+tab|tell\s+me\s+(?:about|how|what|the)|find\s+.*?\s+and\s+tell)/i.test(g);

  if (isQuestionOrRetrieval) {
    let queryTopic = 'submissions';
    if (/submi/i.test(g)) queryTopic = 'submissions';
    else if (/problem|ps\b/i.test(g)) queryTopic = 'problem statements';
    else if (g.includes('count') || g.includes('how many')) queryTopic = 'count';

    return {
      supported: true,
      goalPattern: 'answer_question',
      mode: 'answer',
      isAnswerGoal: true,
      isMultiStep: true,
      isPassive: false, // NOT passive - allows active tab switching, navigation, and extraction
      queryTopic,
      expectedTerminal: { kind: 'answer_supported', queryTopic },
      structuredIntent: {
        intent: 'observe',
        targetPhrase: queryTopic,
        targetTokens: tokenizeSemanticText(queryTopic)
      }
    };
  }

  // 1b. Passive observation or immediate finish task
  if (/^(?:observe|check|inspect|finish|read|summarize|review|analyze|tell|what|scan|look|see)\b/i.test(g)) {
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
    const hasSubmitSuffix = /\b(?:and\s+(?:send|sent|submit|press\s+enter|hit\s+enter|post))\b/i.test(g);
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

  // 8. Generic clicking / interactions / navigation (button, link, item, admin, finish, sanitize, navigate, go to, show, open, tap, expand, delete, remove)
  // Extracts target phrase, role hints, and contextual qualifiers (e.g. "Open View Details for SIH26003")
  const verbMatch = g.match(/^(?:(?:please|kindly)\s+)?(?:click|open|press|tap|show|expand|navigate\s+to|go\s+to|view|visit|explore|browse|delete|remove)\s+(?:on\s+)?(?:the\s+)?/i);
  const hasInteractionVerb = Boolean(verbMatch);
  let cleanStr = hasInteractionVerb ? g.replace(verbMatch![0], '').trim() : g;

  cleanStr = cleanStr.replace(/\s+(?:repeatedly|again|multiple\s+times|continuously|twice|until\s+done)\b/i, '').trim();

  let roleHint: ElementRole | undefined;
  if (/\b(?:link)\b/i.test(cleanStr)) roleHint = 'link';
  else if (/\b(?:button)\b/i.test(cleanStr)) roleHint = 'button';
  else if (/\b(?:tab)\b/i.test(cleanStr)) roleHint = 'tab';

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

export interface ActionProposal {
  readonly actionId: string;
  readonly kind: ActionKind;
  readonly targetLocalId?: string;
  readonly destinationLocalId?: string;
  readonly confidence: number;
  readonly risk: RiskLevel;
  readonly rationale: string;
  readonly expectedState?: string;
  readonly expectedPostcondition?: ExpectedPostcondition;
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
  readonly reasoning?: string;
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
  'kind',
  'targetLocalId',
  'destinationLocalId',
  'confidence',
  'risk',
  'rationale',
  'expectedState',
  'expectedPostcondition',
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
  'reasoning',
  'thought'
]);

const VALID_ACTION_KINDS = new Set([
  'observe',
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
      return { isValid: false, errorMessage: `Closed schema violation: Unknown action property` };
    }
  }

  // 2. actionId
  if (typeof proposal.actionId !== 'string' || !ACTION_ID_REGEX.test(proposal.actionId)) {
    return { isValid: false, errorMessage: 'Invalid or missing "actionId"' };
  }
  if (hasProhibitedScriptPattern(proposal.actionId) || hasProhibitedUrlPattern(proposal.actionId)) {
    return { isValid: false, errorMessage: 'actionId contains prohibited script or URL patterns' };
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

  // Actions requiring targetLocalId
  if (kind === 'click' || kind === 'hover' || kind === 'type' || kind === 'select' || kind === 'upload_file') {
    if (!proposal.targetLocalId || typeof proposal.targetLocalId !== 'string') {
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

  // 9b. userApproved & pressEnter validation
  if (proposal.userApproved !== undefined && typeof proposal.userApproved !== 'boolean') {
    return { isValid: false, errorMessage: 'Field "userApproved" must be a boolean' };
  }
  if (proposal.pressEnter !== undefined && typeof proposal.pressEnter !== 'boolean') {
    return { isValid: false, errorMessage: 'Field "pressEnter" must be a boolean' };
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
  const match = goal.trim().match(/^(?:(?:please|kindly)\s+)?(?:open|go\s+to|visit|launch|load|navigate\s+to)\s+(?:https?:\/\/[^\s]+|[a-zA-Z0-9_.-]+)\s+(?:and\s+then|then|after\s+that|and|,)\s+(.+)$/i);
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
  const ACTION_PREFIX_REGEX = /^(?:(?:please|kindly)\s+|(?:can|could|would|will)\s+you\s+|(?:i\s+(?:want|need)\s+you\s+to)\s+|(?:go\s+ahead\s+and)\s+|(?:hey|hi)\s+(?:privapilot[,!]?\s+)?(?:please\s+)?|(?:and\s+then|then|after\s+that|and|also|now|next|so)\s+)+/i;
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

