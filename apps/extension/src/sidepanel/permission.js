/**
 * PrivaPilot Extension Microphone Permission Handler
 * Requests getUserMedia in full browser tab context with a direct user gesture
 * so Chrome reliably displays the native microphone permission prompt.
 */

const allowMicBtn = document.getElementById('allowMicBtn');
const statusMsg = document.getElementById('statusMsg');
let isProcessing = false;

async function triggerMicPermission() {
  if (isProcessing) return;
  isProcessing = true;

  if (statusMsg) {
    statusMsg.className = 'status-msg';
    statusMsg.textContent = 'Requesting browser permission...';
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop all audio tracks immediately after granting permission
    stream.getTracks().forEach(track => track.stop());

    if (statusMsg) {
      statusMsg.className = 'status-msg success';
      statusMsg.textContent = '✓ Microphone permission granted! Returning to PrivaPilot...';
    }

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'MIC_PERMISSION_GRANTED' }).catch(() => {});
    }

    setTimeout(() => {
      window.close();
    }, 800);
  } catch (err) {
    isProcessing = false;
    if (statusMsg) {
      statusMsg.className = 'status-msg error';
      statusMsg.textContent = '⚠️ Microphone access not granted yet. Please click "Allow Microphone" and select Allow in the browser prompt.';
    }
  }
}

allowMicBtn?.addEventListener('click', triggerMicPermission);
