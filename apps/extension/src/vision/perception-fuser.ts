/**
 * @privapilot/extension - Multi-Modal Perception Fuser (Stage E)
 *
 * Merges DOM layout extractions with on-device visual UI candidate proposals:
 * - Computes spatial IoU and semantic role agreement
 * - Supports three strictly benchmarked modes: 'dom-only', 'vision-only', 'fused'
 * - Fused candidates enhance confidence; disagreements preserve provenance
 */

import {
  SanitizedElement,
  VisualRegionProposal,
  PerceptionCandidate,
  PerceptionResult,
  PerceptionMode
} from '@privapilot/protocol';

export function computeBoxIoU(
  b1: readonly [number, number, number, number],
  b2: readonly [number, number, number, number]
): number {
  const yA = Math.max(b1[0], b2[0]);
  const xA = Math.max(b1[1], b2[1]);
  const yB = Math.min(b1[2], b2[2]);
  const xB = Math.min(b1[3], b2[3]);

  const interArea = Math.max(0, yB - yA) * Math.max(0, xB - xA);
  const area1 = Math.max(0, b1[2] - b1[0]) * Math.max(0, b1[3] - b1[1]);
  const area2 = Math.max(0, b2[2] - b2[0]) * Math.max(0, b2[3] - b2[1]);
  const unionArea = area1 + area2 - interArea;

  return unionArea > 0 ? interArea / unionArea : 0;
}

export class PerceptionFuser {
  /**
   * Fuses DOM elements and visual region proposals according to perception mode.
   */
  static fuse(
    captureId: string,
    domElements: ReadonlyArray<SanitizedElement>,
    visualProposals: ReadonlyArray<VisualRegionProposal>,
    mode: PerceptionMode = 'fused'
  ): PerceptionResult {
    const t0 = Date.now();

    // 1. DOM-Only Mode
    if (mode === 'dom-only') {
      const candidates: PerceptionCandidate[] = domElements.map((el) => ({
        candidateId: `cand_dom_${el.localId}`,
        captureId,
        role: el.role,
        sanitizedName: el.sanitizedName,
        coarseBounds: el.coarseBounds,
        confidence: 0.85,
        actionCapabilities: el.actionCapabilities,
        provenance: 'dom' as const,
        domLocalId: el.localId
      }));

      return {
        captureId,
        mode: 'dom-only',
        candidates,
        durationMs: Date.now() - t0,
        domCandidateCount: candidates.length,
        visualCandidateCount: 0,
        fusedCandidateCount: 0
      };
    }

    // 2. Vision-Only Mode (Pure visual geometry, zero DOM attribute leakage)
    if (mode === 'vision-only') {
      const candidates: PerceptionCandidate[] = visualProposals.map((vp) => ({
        candidateId: `cand_vis_${vp.visualRegionId}`,
        captureId,
        role: vp.role,
        sanitizedName: `[VISUAL_${vp.role.toUpperCase()}_${vp.visualRegionId}]`,
        coarseBounds: vp.bounds,
        confidence: vp.edgeConfidence,
        actionCapabilities: vp.role === 'button' || vp.role === 'icon' ? ['click'] : ['click', 'type'],
        provenance: 'vision' as const,
        visualRegionId: vp.visualRegionId
      }));

      return {
        captureId,
        mode: 'vision-only',
        candidates,
        durationMs: Date.now() - t0,
        domCandidateCount: 0,
        visualCandidateCount: candidates.length,
        fusedCandidateCount: 0
      };
    }

    // 3. Fused Mode (Spatial & Semantic Agreement)
    const candidates: PerceptionCandidate[] = [];
    const matchedVisIds = new Set<string>();
    const spatialAgreements: number[] = [];

    for (const domEl of domElements) {
      let bestMatch: VisualRegionProposal | null = null;
      let maxIoU = 0;

      for (const vp of visualProposals) {
        if (matchedVisIds.has(vp.visualRegionId)) continue;
        const iou = computeBoxIoU(domEl.coarseBounds, vp.bounds);
        if (iou > maxIoU) {
          maxIoU = iou;
          bestMatch = vp;
        }
      }

      if (bestMatch && maxIoU >= 0.25) {
        matchedVisIds.add(bestMatch.visualRegionId);
        spatialAgreements.push(maxIoU);
        const rolesMatch = domEl.role.toLowerCase() === bestMatch.role.toLowerCase();
        const semanticAgreement = rolesMatch ? 1.0 : 0.6;
        const confidence = Math.min(1.0, Math.round((0.75 + maxIoU * 0.2 + (rolesMatch ? 0.05 : 0)) * 100) / 100);

        candidates.push({
          candidateId: `cand_fused_${domEl.localId}`,
          captureId,
          role: domEl.role,
          sanitizedName: domEl.sanitizedName,
          coarseBounds: domEl.coarseBounds,
          confidence,
          actionCapabilities: domEl.actionCapabilities,
          provenance: 'fused',
          domLocalId: domEl.localId,
          visualRegionId: bestMatch.visualRegionId,
          spatialAgreement: Math.round(maxIoU * 1000) / 1000,
          semanticAgreement
        });
      } else {
        // Unmatched DOM element
        candidates.push({
          candidateId: `cand_dom_${domEl.localId}`,
          captureId,
          role: domEl.role,
          sanitizedName: domEl.sanitizedName,
          coarseBounds: domEl.coarseBounds,
          confidence: 0.80,
          actionCapabilities: domEl.actionCapabilities,
          provenance: 'dom',
          domLocalId: domEl.localId
        });
      }
    }

    // Include un-matched visual proposals (e.g. elements drawn on canvas or in shadow/iframe)
    for (const vp of visualProposals) {
      if (!matchedVisIds.has(vp.visualRegionId)) {
        candidates.push({
          candidateId: `cand_vis_${vp.visualRegionId}`,
          captureId,
          role: vp.role,
          sanitizedName: `[VISUAL_${vp.role.toUpperCase()}_${vp.visualRegionId}]`,
          coarseBounds: vp.bounds,
          confidence: Math.round(vp.edgeConfidence * 0.7 * 100) / 100,
          actionCapabilities: vp.role === 'button' || vp.role === 'icon' ? ['click'] : ['click', 'type'],
          provenance: 'vision',
          visualRegionId: vp.visualRegionId
        });
      }
    }

    const meanSpatialAgreement =
      spatialAgreements.length > 0
        ? Math.round((spatialAgreements.reduce((a, b) => a + b, 0) / spatialAgreements.length) * 1000) / 1000
        : undefined;

    return {
      captureId,
      mode: 'fused',
      candidates,
      durationMs: Date.now() - t0,
      domCandidateCount: domElements.length,
      visualCandidateCount: visualProposals.length,
      fusedCandidateCount: spatialAgreements.length,
      meanSpatialAgreement
    };
  }
}
