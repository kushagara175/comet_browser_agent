/**
 * Apex Operations Portal Interactive Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  const openSafePreviewBtn = document.getElementById('openSafePreviewBtn');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');
  const previewDrawer = document.getElementById('previewDrawer');
  const submitApprovalBtn = document.getElementById('submitApprovalBtn');

  // Open Safe Preview
  if (openSafePreviewBtn && previewDrawer) {
    openSafePreviewBtn.addEventListener('click', () => {
      previewDrawer.classList.remove('hidden');
    });
  }

  // Close Drawer
  if (closeDrawerBtn && previewDrawer) {
    closeDrawerBtn.addEventListener('click', () => {
      previewDrawer.classList.add('hidden');
    });
  }

  // Submit Approval
  if (submitApprovalBtn && previewDrawer) {
    submitApprovalBtn.addEventListener('click', () => {
      alert('✓ Final Approval Submitted for Ticket #ISRO-9024');
      previewDrawer.classList.add('hidden');
    });
  }

  // Render Telemetry Canvas
  const canvas = document.getElementById('telemetryCanvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(10, 45);

      for (let x = 10; x < canvas.width - 10; x += 15) {
        const y = 45 + Math.sin(x * 0.1) * 20;
        ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '10px monospace';
      ctx.fillText('Payload Sensor Volts: 3.32V', 15, 20);
    }
  }
});
