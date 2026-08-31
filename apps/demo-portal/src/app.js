/**
 * PrivaPilot Demo Portal Controller
 *
 * Implements interactive multi-step workflow with search filtering, preview modal/drawer,
 * protected approval execution, cancellation paths, and simulated DOM row mutation.
 */

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('searchRequests');
  const searchBtn = document.getElementById('searchBtn');
  const mutateRowBtn = document.getElementById('mutateRowBtn');
  const openSafePreviewBtn = document.getElementById('openSafePreviewBtn');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');
  const cancelDrawerBtn = document.getElementById('cancelDrawerBtn');
  const previewDrawer = document.getElementById('previewDrawer');
  const submitApprovalBtn = document.getElementById('submitApprovalBtn');
  const statusRegion = document.getElementById('statusRegion');
  const requestsTableBody = document.getElementById('requestsTableBody');
  const statusReq1044 = document.getElementById('statusReq1044');

  // 1. Draw Realtime Sensor Stream onto Canvas (Uninspectable Surface)
  const canvas = document.getElementById('telemetryCanvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      let phase = 0;
      function renderCanvas() {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);

        for (let x = 0; x < canvas.width; x += 5) {
          const y = canvas.height / 2 + Math.sin((x + phase) * 0.08) * 18 + Math.cos((x - phase) * 0.04) * 8;
          ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.fillStyle = '#94a3b8';
        ctx.font = '9px monospace';
        ctx.fillText('ENCRYPTED TELEMETRY STREAM: 48.2 kHz', 8, 14);
        phase += 2;
      }
      renderCanvas();
      setInterval(renderCanvas, 250);
    }
  }

  // 2. Search & Filter Table Rows
  function filterRows() {
    const query = (searchInput?.value || '').trim().toLowerCase();
    const rows = requestsTableBody?.querySelectorAll('tr') || [];

    rows.forEach((row) => {
      if (!query) {
        row.style.display = '';
        return;
      }
      const text = row.textContent?.toLowerCase() || '';
      row.style.display = text.includes(query) ? '' : 'none';
    });

    if (statusRegion && query) {
      statusRegion.textContent = `Filtered table for "${query}"`;
      statusRegion.classList.remove('hidden');
    }
  }

  searchInput?.addEventListener('input', filterRows);
  searchBtn?.addEventListener('click', filterRows);

  // 3. Open Safe Preview Drawer
  function openDrawer() {
    if (previewDrawer) {
      previewDrawer.classList.remove('hidden');
      previewDrawer.setAttribute('aria-expanded', 'true');
    }
    if (statusRegion) {
      statusRegion.textContent = 'Preview drawer opened for request #REQ-1044';
      statusRegion.classList.remove('hidden');
    }
  }

  openSafePreviewBtn?.addEventListener('click', openDrawer);

  // 4. Close & Cancel Drawer (Cancellation Path)
  function closeDrawer() {
    if (previewDrawer) {
      previewDrawer.classList.add('hidden');
      previewDrawer.setAttribute('aria-expanded', 'false');
    }
    if (statusRegion) {
      statusRegion.textContent = 'Preview drawer closed';
    }
  }

  closeDrawerBtn?.addEventListener('click', closeDrawer);
  cancelDrawerBtn?.addEventListener('click', closeDrawer);

  // 5. Submit Final Approval (Protected Action Execution)
  submitApprovalBtn?.addEventListener('click', () => {
    if (statusReq1044) {
      statusReq1044.textContent = 'Approved';
      statusReq1044.className = 'badge approved';
    }

    if (openSafePreviewBtn) {
      openSafePreviewBtn.textContent = 'Approved';
      openSafePreviewBtn.disabled = true;
      openSafePreviewBtn.classList.remove('btn-action');
      openSafePreviewBtn.classList.add('btn-table');
    }

    if (statusRegion) {
      statusRegion.textContent = '✓ Final approval submitted and clearance granted for #REQ-1044';
      statusRegion.className = 'status-alert-box success';
      statusRegion.classList.remove('hidden');
    }

    closeDrawer();
  });

  // 6. Stale Target Mutation Handler (Simulates DOM replacement for stale recovery)
  mutateRowBtn?.addEventListener('click', () => {
    const row = document.getElementById('rowReq1044');
    if (row && row.parentNode) {
      const cloned = row.cloneNode(true);
      const newBtn = cloned.querySelector('#openSafePreviewBtn');
      if (newBtn) {
        newBtn.addEventListener('click', openDrawer);
      }
      row.parentNode.replaceChild(cloned, row);

      if (statusRegion) {
        statusRegion.textContent = '⚡ Stale DOM Mutation: Table row node #REQ-1044 was detached and replaced';
        statusRegion.className = 'status-alert-box';
        statusRegion.classList.remove('hidden');
      }
    }
  });
});

