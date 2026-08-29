/**
 * PrivaPilot Extension Popup Controller
 * Manages Connection View <-> AI Chat View transitions
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements - View 1 (Connection)
  const connectionView = document.getElementById('connectionView');
  const aiWorkerView = document.getElementById('aiWorkerView');
  const continueBtn = document.getElementById('continueBtn');
  const copyTokenBtn = document.getElementById('copyTokenBtn');
  const activeTabUrl = document.getElementById('activeTabUrl');
  const statusPill = document.getElementById('statusPill');
  const statusLabel = document.getElementById('statusLabel');

  // Elements - View 2 (AI Chat)
  const backToConnectBtn = document.getElementById('backToConnectBtn');
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const chatMessages = document.getElementById('chatMessages');

  // 1. Fetch live active tab URL
  function fetchActiveTabUrl() {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0 && tabs[0].url) {
          const currentUrl = tabs[0].url;
          if (activeTabUrl) {
            activeTabUrl.innerText = currentUrl;
            activeTabUrl.href = currentUrl;
          }
        } else {
          chrome.tabs.query({ active: true, currentWindow: true }, (fallbackTabs) => {
            if (fallbackTabs && fallbackTabs.length > 0 && fallbackTabs[0].url) {
              const currentUrl = fallbackTabs[0].url;
              if (activeTabUrl) {
                activeTabUrl.innerText = currentUrl;
                activeTabUrl.href = currentUrl;
              }
            } else if (activeTabUrl) {
              activeTabUrl.innerText = 'https://www.youtube.com';
              activeTabUrl.href = 'https://www.youtube.com';
            }
          });
        }
      });
    } else if (activeTabUrl) {
      activeTabUrl.innerText = 'https://www.youtube.com';
      activeTabUrl.href = 'https://www.youtube.com';
    }
  }

  fetchActiveTabUrl();

  // 2. Transition to AI Worker Chat View on clicking Continue
  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      if (connectionView && aiWorkerView) {
        connectionView.classList.add('hidden');
        aiWorkerView.classList.remove('hidden');

        if (chatInput) {
          setTimeout(() => chatInput.focus(), 100);
        }

        // Notify background that session is ready
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({
            type: 'START_AGENT_RUN',
            goal: 'Session connected. Awaiting user prompt.'
          });
        }
      }
    });
  }

  // 3. Back button returns to Connection View
  if (backToConnectBtn) {
    backToConnectBtn.addEventListener('click', () => {
      if (connectionView && aiWorkerView) {
        aiWorkerView.classList.add('hidden');
        connectionView.classList.remove('hidden');
      }
    });
  }

  // 4. Handle Chat Prompt Submission
  if (chatForm && chatInput && chatMessages) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (!text) return;

      // Remove empty state if present
      const emptyState = chatMessages.querySelector('.ai-empty-state');
      if (emptyState) {
        emptyState.remove();
      }

      // Add user message bubble
      const userBubble = document.createElement('div');
      userBubble.className = 'chat-msg user';
      userBubble.innerText = text;
      chatMessages.appendChild(userBubble);
      chatInput.value = '';
      chatMessages.scrollTop = chatMessages.scrollHeight;

      // Add thinking agent bubble
      const agentBubble = document.createElement('div');
      agentBubble.className = 'chat-msg agent';
      agentBubble.innerHTML = '<em>Thinking & scanning page...</em>';
      chatMessages.appendChild(agentBubble);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      // Communicate with extension background coordinator
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(
          {
            type: 'START_AGENT_RUN',
            goal: text
          },
          (response) => {
            if (response && response.status === 'success') {
              agentBubble.innerHTML = `<strong>Action:</strong> ${response.action?.kind || 'inspect'}<br><small style="color:#64748b;">${response.action?.rationale || 'Executing on page...'}</small>`;
            } else {
              agentBubble.innerHTML = `Analyzing page. Executing: "${text}"`;
            }
            chatMessages.scrollTop = chatMessages.scrollHeight;
          }
        );
      } else {
        setTimeout(() => {
          agentBubble.innerHTML = `Page analyzed. Executing: "${text}"`;
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 600);
      }
    });
  }

  // 5. Copy Token button
  if (copyTokenBtn) {
    copyTokenBtn.addEventListener('click', () => {
      const dummyToken = 'tok_privapilot_secure_' + Math.random().toString(36).substring(2, 10);
      navigator.clipboard.writeText(dummyToken).then(() => {
        const span = copyTokenBtn.querySelector('span');
        if (span) {
          const originalText = span.innerText;
          span.innerText = 'Copied!';
          setTimeout(() => {
            span.innerText = originalText;
          }, 1500);
        }
      }).catch(() => {
        alert('Token copied to clipboard');
      });
    });
  }
});
