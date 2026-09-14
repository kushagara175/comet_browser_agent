/**
 * PrivaPilot Extension Microphone Permission Handler
 * Requests getUserMedia in full browser tab context so Chrome displays the permission prompt.
 */

const allowMicBtn = document.getElementById('allowMicBtn');
const statusMsg = document.getElementById('statusMsg');

async function triggerMicPermission() {
  if (statusMsg) {
    statusMsg.className = 'status-msg';
    statusMsg.textContent = 'Requesting browser permission...';
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop tracks immediately after granting permission
    stream.getTracks().forEach(track => track.stop());

    if (statusMsg) {
      statusMsg.className = 'status-msg success';
      statusMsg.textContent = '✓ Microphone granted! Returning to PrivaPilot...';
    }

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'MIC_PERMISSION_GRANTED' }).catch(() => {});
    }

    setTimeout(() => {
      window.close();
    }, 900);
  } catch (err) {
    if (statusMsg) {
      statusMsg.className = 'status-msg error';
      statusMsg.textContent = '⚠️ Microphone access was not allowed. Please click "Allow" when Chrome prompts.';
    }
  }
}

allowMicBtn?.addEventListener('click', triggerMicPermission);

// Automatically request on page load
document.addEventListener('DOMContentLoaded', () => {
  triggerMicPermission();
});
