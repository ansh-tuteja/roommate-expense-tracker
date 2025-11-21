// Settlements Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
  initializeSettlements();
});

function initializeSettlements() {
  setupNotificationActions();
  setupGroupToggle();
  setupHistoryToggle();
  setupNewSettlementModal();
  setupRejectionModal();
  setupFAB();
  loadInitialData();
}

// Load initial settlement data
function loadInitialData() {
  loadSettlementHistory();
  
  // Auto-expand groups with pending settlements
  const groupCards = document.querySelectorAll('.group-card');
  groupCards.forEach(card => {
    const pendingCount = card.querySelector('.stat.pending .count');
    if (pendingCount && parseInt(pendingCount.textContent) > 0) {
      const groupId = card.dataset.groupId;
      toggleGroupSettlements(groupId, true);
    }
  });
}

// Setup notification action buttons
function setupNotificationActions() {
  // Accept settlement buttons
  document.querySelectorAll('.accept-settlement-btn').forEach(btn => {
    btn.addEventListener('click', function (event) {
      const settlementId = this.dataset.settlementId;
      const amount = this.dataset.amount;
      const debtor = this.dataset.debtor;

      showConfirmation(`Accept settlement of ₹${amount} from ${debtor}?`, () => {
        acceptSettlement(settlementId, event.currentTarget);
      });
    });
  });

  // Reject settlement buttons
  document.querySelectorAll('.reject-settlement-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const settlementId = this.dataset.settlementId;
      showRejectionModal(settlementId);
    });
  });
}

// Setup group toggle functionality
function setupGroupToggle() {
  document.querySelectorAll('.toggle-settlements-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const groupId = this.dataset.groupId;
      const isExpanded = this.dataset.expanded === 'true';
      toggleGroupSettlements(groupId, !isExpanded);
    });
  });
}

// Toggle group settlements display
async function toggleGroupSettlements(groupId, expand) {
  const settlementsDiv = document.getElementById(`settlements-${groupId}`);
  const toggleBtn = document.querySelector(`[data-group-id="${groupId}"].toggle-settlements-btn`);
  const toggleText = toggleBtn.querySelector('.toggle-text');
  const toggleIcon = toggleBtn.querySelector('.toggle-icon');

  if (expand) {
    // Load settlements for this group
    await loadGroupSettlements(groupId);
    settlementsDiv.classList.remove('collapsed');
    settlementsDiv.classList.add('expanded');
    toggleBtn.dataset.expanded = 'true';
    toggleText.textContent = 'Hide Settlements';
    toggleIcon.style.transform = 'rotate(180deg)';
  } else {
    settlementsDiv.classList.remove('expanded');
    settlementsDiv.classList.add('collapsed');
    toggleBtn.dataset.expanded = 'false';
    toggleText.textContent = 'View Settlements';
    toggleIcon.style.transform = 'rotate(0deg)';
  }
}

// Load settlements for a specific group
async function loadGroupSettlements(groupId) {
  const settlementsDiv = document.getElementById(`settlements-${groupId}`);
  
  try {
    const response = await fetch(`/api/settlements/group/${groupId}`);
    if (!response.ok) throw new Error('Failed to load settlements');
    
    const data = await response.json();
    renderGroupSettlements(settlementsDiv, data.settlements);
  } catch (error) {
    console.error('Error loading group settlements:', error);
    settlementsDiv.innerHTML = `
      <div class="error-message" style="padding: 1rem; text-align: center; color: #e74c3c;">
        Failed to load settlements. Please try again.
      </div>
    `;
  }
}

// Render group settlements
function renderGroupSettlements(container, settlements) {
  if (!settlements || settlements.length === 0) {
    container.innerHTML = `
      <div style="padding: 2rem; text-align: center; color: #7f8c8d;">
        <p>No settlements in this group yet.</p>
      </div>
    `;
    return;
  }

  const html = settlements.map(settlement => `
    <div class="settlement-item" data-settlement-id="${settlement._id}">
      <div class="settlement-info">
        <div class="settlement-description">
          ${settlement.debtorId.username} → ${settlement.payerId.username}
        </div>
        <div class="settlement-meta">
          <span>${settlement.timeAgo}</span>
          <span>${settlement.settlementMethod || 'Cash'}</span>
          ${settlement.notes ? `<span>Note: ${settlement.notes}</span>` : ''}
        </div>
      </div>
      <div class="settlement-amount">₹${settlement.amount.toFixed(2)}</div>
      <div class="status-badge ${settlement.statusClass}">${settlement.status}</div>
      ${renderSettlementActions(settlement)}
    </div>
  `).join('');

  container.innerHTML = html;
  
  // Setup action buttons for newly rendered settlements
  setupSettlementActions(container);
}

// Render settlement action buttons based on status and user
function renderSettlementActions(settlement) {
  const currentUserId = getCurrentUserId(); // You'll need to implement this
  
  if (settlement.status === 'pending') {
    if (settlement.payerId._id === currentUserId) {
      // Current user is the creditor - can accept/reject
      return `
        <div class="settlement-actions">
          <button class="action-btn action-btn-success accept-settlement" 
                  data-settlement-id="${settlement._id}">Accept</button>
          <button class="action-btn action-btn-danger reject-settlement-btn" 
                  data-settlement-id="${settlement._id}">Reject</button>
        </div>
      `;
    } else if (settlement.debtorId._id === currentUserId) {
      // Current user is the debtor - can cancel
      return `
        <div class="settlement-actions">
          <button class="action-btn action-btn-secondary cancel-settlement" 
                  data-settlement-id="${settlement._id}">Cancel Request</button>
        </div>
      `;
    }
  }
  
  return '<div class="settlement-actions"></div>';
}

// Setup settlement action buttons
function setupSettlementActions(container) {
  // Accept buttons
  container.querySelectorAll('.accept-settlement').forEach(btn => {
    btn.addEventListener('click', function (event) {
      const settlementId = this.dataset.settlementId;
      acceptSettlement(settlementId, event.currentTarget);
    });
  });

  // Reject buttons
  // Reject settlement buttons
  container.querySelectorAll('.reject-settlement-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const settlementId = this.dataset.settlementId;
      showRejectionModal(settlementId);
    });
  });

  // Cancel buttons
  container.querySelectorAll('.cancel-settlement').forEach(btn => {
    btn.addEventListener('click', function() {
      const settlementId = this.dataset.settlementId;
      cancelSettlement(settlementId);
    });
  });
}

// Accept settlement
async function acceptSettlement(settlementId, button) {
  try {
    if (button) {
      showLoadingButton(button, 'Accepting...');
    }
    
    const response = await fetch(`/api/settlements/${settlementId}/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      const message = error.error || error.message || 'Failed to accept settlement';
      throw new Error(message);
    }
    
    showNotification('Settlement accepted successfully!', 'success');
    
    // Refresh the page to update all data
    setTimeout(() => window.location.reload(), 1000);
  } catch (error) {
    console.error('Error accepting settlement:', error);
    showNotification(error.message || 'Failed to accept settlement', 'error');
    if (button) {
      resetLoadingButton(button, 'Accept');
    }
  }
}

// Reject settlement
async function rejectSettlement(settlementId, reason) {
  try {
    console.log('Rejecting settlement:', settlementId, 'Reason:', reason);
    
    const response = await fetch(`/api/settlements/${settlementId}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reason: reason || 'No reason provided' })
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to reject settlement' }));
      const message = error.error || error.message || 'Failed to reject settlement';
      throw new Error(message);
    }
    
    const result = await response.json();
    console.log('Settlement rejected successfully:', result);
    
    showNotification('Settlement rejected', 'info');
    
    // Refresh the page to update all data
    setTimeout(() => window.location.reload(), 1000);
    
    return true;
  } catch (error) {
    console.error('Error rejecting settlement:', error);
    showNotification(error.message || 'Failed to reject settlement', 'error');
    return false;
  }
}

// Setup history toggle
function setupHistoryToggle() {
  const toggleBtn = document.querySelector('.toggle-history-btn');
  const historyContainer = document.querySelector('.history-container');
  
  if (toggleBtn && historyContainer) {
    toggleBtn.addEventListener('click', function() {
      const isCollapsed = historyContainer.classList.contains('collapsed');
      
      if (isCollapsed) {
        historyContainer.classList.remove('collapsed');
        this.querySelector('.toggle-text').textContent = 'Hide History';
        loadSettlementHistory();
      } else {
        historyContainer.classList.add('collapsed');
        this.querySelector('.toggle-text').textContent = 'Show All History';
      }
    });
  }

  // History tab switching
  document.querySelectorAll('.history-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.history-tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      
      const status = this.dataset.status;
      loadSettlementHistory(status);
    });
  });
}

// Load settlement history
async function loadSettlementHistory(status = 'all') {
  const historyContainer = document.getElementById('settlement-history');
  
  try {
    historyContainer.innerHTML = '<div class="loading-settlements"><div class="loading-spinner"></div><p>Loading history...</p></div>';
    
    // Add cache busting and force fresh data
    const timestamp = new Date().getTime();
    const response = await fetch(`/api/settlements/history?status=${status}&_=${timestamp}`, {
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    
    if (!response.ok) throw new Error('Failed to load history');
    
    const data = await response.json();
    console.log('Settlement history loaded:', data.settlements.length, 'settlements');
    renderSettlementHistory(historyContainer, data.settlements);
  } catch (error) {
    console.error('Error loading settlement history:', error);
    historyContainer.innerHTML = `
      <div class="error-message" style="padding: 2rem; text-align: center; color: #e74c3c;">
        Failed to load settlement history. Please try again.
      </div>
    `;
  }
}

// Render settlement history
function renderSettlementHistory(container, settlements) {
  if (settlements.length === 0) {
    container.innerHTML = `
      <div style="padding: 2rem; text-align: center; color: #7f8c8d;">
        <p>No settlement history found.</p>
      </div>
    `;
    return;
  }

  const html = settlements.map(settlement => `
    <div class="settlement-item">
      <div class="settlement-info">
        <div class="settlement-description">
          ${settlement.debtorId.username} → ${settlement.payerId.username} (${settlement.groupId ? settlement.groupId.groupName : 'Cross-group settlement'})
        </div>
        <div class="settlement-meta">
          <span>${settlement.timeAgo}</span>
          <span>₹${settlement.amount.toFixed(2)}</span>
          ${settlement.rejectionReason ? `<span>Reason: ${settlement.rejectionReason}</span>` : ''}
        </div>
      </div>
      <div class="status-badge ${settlement.statusClass}">${settlement.status}</div>
    </div>
  `).join('');

  container.innerHTML = html;
}

// Setup rejection modal
function setupRejectionModal() {
  const modal = document.getElementById('rejectionModal');
  const closeBtn = document.getElementById('closeRejectionXBtn');
  const cancelBtn = document.getElementById('cancelRejectionBtn');
  const confirmBtn = document.getElementById('confirmRejectionBtn');

  // Close modal handlers
  [closeBtn, cancelBtn].forEach(btn => {
    btn?.addEventListener('click', () => closeModal('rejectionModal'));
  });

  // Confirm rejection
  confirmBtn?.addEventListener('click', async function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const settlementId = document.getElementById('rejectionSettlementId').value;
    const reason = document.getElementById('rejectionReason').value;
    
    console.log('Confirm rejection clicked for settlement:', settlementId);
    
    // Disable button to prevent double-click
    this.disabled = true;
    this.textContent = 'Rejecting...';
    
    const success = await rejectSettlement(settlementId, reason);
    
    if (success) {
      closeModal('rejectionModal');
    } else {
      // Re-enable button if rejection failed
      this.disabled = false;
      this.textContent = 'Reject Settlement';
    }
  });

  // Close on outside click
  modal?.addEventListener('click', function(e) {
    if (e.target === this) closeModal('rejectionModal');
  });
}

// Show rejection modal
function showRejectionModal(settlementId) {
  document.getElementById('rejectionSettlementId').value = settlementId;
  document.getElementById('rejectionReason').value = '';
  document.getElementById('rejectionDescription').textContent = 
    'Please provide a reason for rejecting this settlement request:';
  showModal('rejectionModal');
}

// Setup new settlement modal
function setupNewSettlementModal() {
  const modal = document.getElementById('newSettlementModal');
  const closeBtn = document.getElementById('closeNewSettlementXBtn');
  const cancelBtn = document.getElementById('cancelNewSettlementBtn');
  const submitBtn = document.getElementById('submitNewSettlementBtn');
  const groupSelect = document.getElementById('settlementGroup');
  const creditorSelect = document.getElementById('settlementCreditor');

  // Close modal handlers
  [closeBtn, cancelBtn].forEach(btn => {
    btn?.addEventListener('click', () => closeModal('newSettlementModal'));
  });

  // Group selection change
  groupSelect?.addEventListener('change', async function() {
    const groupId = this.value;
    if (!groupId) {
      creditorSelect.innerHTML = '<option value="">Select a member</option>';
      return;
    }

    try {
      const response = await fetch(`/api/groups/${groupId}/members`);
      const data = await response.json();
      
      creditorSelect.innerHTML = '<option value="">Select a member</option>';
      data.members.forEach(member => {
        creditorSelect.innerHTML += `<option value="${member._id}">${member.username}</option>`;
      });
    } catch (error) {
      console.error('Error loading group members:', error);
      showNotification('Failed to load group members', 'error');
    }
  });

  // Submit new settlement
  submitBtn?.addEventListener('click', async function() {
    const form = document.getElementById('newSettlementForm');
    const formData = new FormData(form);
    
    const settlementData = {
      groupId: formData.get('groupId'),
      creditorId: formData.get('creditorId'),
      amount: parseFloat(formData.get('amount')),
      method: formData.get('method'),
      notes: formData.get('notes')
    };

    // Validation
    if (!settlementData.groupId || !settlementData.creditorId || !settlementData.amount) {
      showNotification('Please fill in all required fields', 'error');
      return;
    }

    if (settlementData.amount <= 0) {
      showNotification('Amount must be greater than 0', 'error');
      return;
    }

    try {
      showLoadingButton(this, 'Sending...');
      
      const response = await fetch('/api/settlements/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(settlementData)
      });

      if (!response.ok) {
        const error = await response.json();
        const message = error.error || error.message || 'Failed to send settlement request';
        throw new Error(message);
      }

      showNotification('Settlement request sent successfully!', 'success');
      closeModal('newSettlementModal');
      form.reset();
      
      // Refresh the page to show new request
      setTimeout(() => window.location.reload(), 1000);
      
    } catch (error) {
      console.error('Error sending settlement request:', error);
      showNotification(error.message || 'Failed to send settlement request', 'error');
      resetLoadingButton(this, 'Send Request');
    }
  });

  // Close on outside click
  modal?.addEventListener('click', function(e) {
    if (e.target === this) closeModal('newSettlementModal');
  });
}

// Setup FAB (Floating Action Button)
function setupFAB() {
  const fab = document.getElementById('addSettlementFab');
  fab?.addEventListener('click', function() {
    showModal('newSettlementModal');
  });
}

// Utility functions
function showModal(modalId) {
  const modal = document.getElementById(modalId);
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  modal.style.display = 'none';
  document.body.style.overflow = 'auto';
}

function showConfirmation(message, callback) {
  if (confirm(message)) {
    callback();
  }
}

function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 1rem 1.5rem;
    border-radius: 6px;
    color: white;
    font-weight: 500;
    z-index: 3000;
    opacity: 0;
    transform: translateX(100%);
    transition: all 0.3s ease;
  `;
  
  // Set background color based on type
  const colors = {
    success: '#27ae60',
    error: '#e74c3c',
    warning: '#f39c12',
    info: '#3498db'
  };
  
  notification.style.backgroundColor = colors[type] || colors.info;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateX(0)';
  }, 100);
  
  // Animate out and remove
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 5000);
}

function showLoadingButton(button, text) {
  button.dataset.originalText = button.textContent;
  button.textContent = text;
  button.disabled = true;
}

function resetLoadingButton(button, text) {
  button.textContent = text || button.dataset.originalText || button.textContent;
  button.disabled = false;
}

function getCurrentUserId() {
  // This should be populated from the server-side template
  return window.currentUserId || null;
}

function cancelSettlement(settlementId) {
  showConfirmation('Cancel this settlement request?', async () => {
    try {
      const response = await fetch(`/api/settlements/${settlementId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        const message = error.error || error.message || 'Failed to cancel settlement';
        throw new Error(message);
      }
      
      showNotification('Settlement request cancelled', 'info');
      setTimeout(() => window.location.reload(), 1000);
      
    } catch (error) {
      console.error('Error cancelling settlement:', error);
      showNotification(error.message || 'Failed to cancel settlement', 'error');
    }
  });
}