// Dashboard JavaScript with caching support

// Dashboard data caching
let currentUserId = null;

document.addEventListener('DOMContentLoaded', function() {
  initializeCaching();
});

// Initialize browser-side caching
function initializeCaching() {
  // Get current user ID from page data
  const userElement = document.querySelector('[data-user-id]');
  if (userElement) {
    currentUserId = userElement.getAttribute('data-user-id');
  }
  
  if (!currentUserId) {
    return;
  }
  primeDashboardCacheFromDom();
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  if (!isOnline) {
    loadCachedDashboardData();
  }
  refreshDashboardSummary();

  window.addEventListener('online', () => {
    refreshDashboardSummary();
  });
}

// Handle expense actions (edit and delete)
function setupExpenseActions() {
  // Edit expense buttons
  document.querySelectorAll('.edit-expense-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const expenseId = this.dataset.id;
      window.location.href = `/expenses/${expenseId}/edit`;
    });
  });
  
  // Delete expense buttons
  document.querySelectorAll('.delete-expense-btn').forEach(btn => {
    btn.addEventListener('click', async function() {
      if (!confirm('Are you sure you want to delete this expense?')) return;
      
      const expenseId = this.dataset.id;
      try {
        const response = await fetch(`/expenses/${expenseId}`, {
          method: 'DELETE'
        });
        
        if (response.ok) {
          // Clear cache after successful deletion
          if (window.DashboardCache && currentUserId) {
            window.DashboardCache.invalidateUser(currentUserId);
          }
          
          // Refresh the page immediately to show updated data
          window.location.reload();
        } else {
          const errorData = await response.json();
          showNotification(errorData.error || 'Failed to delete expense', 'error');
        }
      } catch (err) {
        console.error('Delete expense error:', err);
        showNotification('Network error while deleting expense', 'error');
      }
    });
  });
}

// Handle settlement actions
function setupSettlementActions() {
  // Settlement buttons
  const settleButtons = document.querySelectorAll('.settle-balance-btn');
  console.log(`Found ${settleButtons.length} settle buttons`);
  
  settleButtons.forEach((btn, index) => {
    console.log(`Settle button ${index}:`, {
      debtor: btn.dataset.debtor,
      creditor: btn.dataset.creditor,
      amount: btn.dataset.amount,
      debtorName: btn.dataset.debtorName,
      creditorName: btn.dataset.creditorName
    });
    
    btn.addEventListener('click', function(event) {
      event.preventDefault();
      event.stopPropagation();
      
      const debtorId = this.dataset.debtor;
      const creditorId = this.dataset.creditor;
      const amount = this.dataset.amount;
      const debtorName = this.dataset.debtorName;
      const creditorName = this.dataset.creditorName;
      
      console.log('Settle button clicked with data:', {
        debtorId,
        creditorId,
        amount,
        debtorName,
        creditorName
      });
      
      // Fill settlement form
      document.getElementById('settlementAmount').value = amount;
      document.getElementById('settlementDebtorId').value = debtorId;
      document.getElementById('settlementCreditorId').value = creditorId;
      
      console.log('Form fields set to:', {
        debtorId: document.getElementById('settlementDebtorId').value,
        creditorId: document.getElementById('settlementCreditorId').value,
        amount: document.getElementById('settlementAmount').value
      });
      
      // Update settlement modal text
      document.getElementById('settlementDescription').textContent = 
        `Settlement: ${debtorName} pays ${creditorName} ₹${parseFloat(amount).toFixed(2)}`;
      
      // Get current active group from the page
      const activeGroupId = document.querySelector('.group-tab.active')?.dataset.groupId;
      if (activeGroupId) {
        document.getElementById('settlementGroupId').value = activeGroupId;
      }
      
      // Show settlement modal
      const modal = document.getElementById('settlementModal');
      modal.style.display = 'flex';
      modal.classList.add('active');
    });
  });
  
  // Function to close the settlement modal
  function closeSettlementModal() {
    const modal = document.getElementById('settlementModal');
    modal.classList.remove('active');
    
    // Use setTimeout to allow the fade-out animation to complete
    setTimeout(() => {
      modal.style.display = 'none';
    }, 300);
  }
  
  // Close button in footer
  const closeSettlementBtn = document.getElementById('closeSettlementBtn');
  if (closeSettlementBtn) {
    closeSettlementBtn.addEventListener('click', function() {
      closeSettlementModal();
    });
  } else {
    console.warn("Close settlement button not found");
  }
  
  // X close button in header
  const closeSettlementXBtn = document.getElementById('closeSettlementXBtn');
  if (closeSettlementXBtn) {
    closeSettlementXBtn.addEventListener('click', function() {
      closeSettlementModal();
    });
  }
  
  // Close modal when clicking outside
  const settlementModal = document.getElementById('settlementModal');
  if (settlementModal) {
    settlementModal.addEventListener('click', function(event) {
      if (event.target === this) {
        closeSettlementModal();
      }
    });
  }
  
  // Close modal with escape key
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && settlementModal.style.display === 'flex') {
      closeSettlementModal();
    }
  });
  
  // Submit settlement button
  const submitSettlementBtn = document.getElementById('submitSettlementBtn');
  if (submitSettlementBtn) {
    submitSettlementBtn.addEventListener('click', function(event) {
      console.log("Submit settlement button clicked");
      event.preventDefault();
      
      const settlementForm = document.getElementById('settlementForm');
      if (settlementForm) {
        submitSettlementForm(settlementForm);
      }
    });
  } else {
    console.warn("Submit settlement button not found");
  }
  
  // Handle settlement form submission
  const settlementForm = document.getElementById('settlementForm');
  if (settlementForm) {
    settlementForm.addEventListener('submit', function(e) {
      e.preventDefault();
      submitSettlementForm(settlementForm);
    });
  } else {
    console.warn("Settlement form not found");
  }
}

// Extract submission logic to a separate function
async function submitSettlementForm(form) {
  // Validate the form before submission
  const amountField = form.querySelector('#settlementAmount');
  if (!amountField || !amountField.value || parseFloat(amountField.value) <= 0) {
    showNotification('Please enter a valid amount greater than 0', 'error');
    return;
  }
  
  // Validate debtor and creditor IDs
  const debtorIdField = form.querySelector('#settlementDebtorId');
  const creditorIdField = form.querySelector('#settlementCreditorId');
  
  if (!debtorIdField || !debtorIdField.value) {
    console.error('Debtor ID is missing!');
    showNotification('Error: Debtor ID is missing. Please try clicking the settle button again.', 'error');
    return;
  }
  
  if (!creditorIdField || !creditorIdField.value) {
    console.error('Creditor ID is missing!');
    showNotification('Error: Creditor ID is missing. Please try clicking the settle button again.', 'error');
    return;
  }
  
  // Show loading state
  const submitBtn = document.getElementById('submitSettlementBtn');
  const originalBtnText = submitBtn.textContent;
  submitBtn.textContent = 'Processing...';
  submitBtn.disabled = true;
  
  const formData = new FormData(form);
  const settlementData = {
    debtorId: formData.get('debtorId'),
    creditorId: formData.get('creditorId'),
    amount: formData.get('amount'),
    description: formData.get('description') || 'Debt Settlement',
    groupId: formData.get('groupId') || null
  };
  
  console.log('Settlement data being sent:', settlementData);
  
  try {
    const response = await fetch('/settlements', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(settlementData)
    });
    
    console.log('Settlement response status:', response.status);
    
    if (response.ok) {
      // Close modal properly with fade-out animation
      const modal = document.getElementById('settlementModal');
      modal.classList.remove('active');
      setTimeout(() => {
        modal.style.display = 'none';
        
        // Reset form
        form.reset();
        
        showNotification('Settlement recorded successfully! Updating balances...', 'success');
        
        // Add a slight delay before reload to allow the notification to be seen
        setTimeout(() => {
          // Force reload the page to update balances
          window.location.reload();
        }, 1000);
      }, 300);
    } else {
      // Handle error response
      let errorMessage = 'Failed to record settlement';
      try {
        const errorData = await response.json();
        console.error('Server error response:', errorData);
        errorMessage = errorData.error || errorMessage;
      } catch (parseError) {
        console.error('Error parsing response:', parseError);
        errorMessage = 'Network error - please try again';
      }
      
      console.error('Settlement submission failed:', errorMessage);
      showNotification(errorMessage, 'error');
      
      // Reset button state
      submitBtn.textContent = originalBtnText;
      submitBtn.disabled = false;
    }
  } catch (err) {
    console.error('Settlement error:', err);
    showNotification('Network error while recording settlement', 'error');
    
    // Reset button state on error
    submitBtn.textContent = originalBtnText;
    submitBtn.disabled = false;
  }
}

// Handle group details modal
function setupGroupDetails() {
  // Group detail buttons
  document.querySelectorAll('.group-details-btn').forEach(btn => {
    btn.addEventListener('click', async function() {
      const groupId = this.dataset.id;
      
      try {
        const response = await fetch(`/api/groups/${groupId}`);
        if (response.ok) {
          const groupData = await response.json();
          
          // Update modal title
          document.getElementById('groupDetailsTitle').textContent = 
            `${groupData.group.groupName} Details`;
          
          // Generate modal content
          let content = `
            <h4>Members</h4>
            <ul class="member-list">
          `;
          
          groupData.group.members.forEach(member => {
            content += `
              <li>${member.username || 'Unknown user'}</li>
            `;
          });
          
          content += `
            </ul>
            <h4>Recent Expenses</h4>
            <ul class="expense-list">
          `;
          
          if (groupData.recentExpenses && groupData.recentExpenses.length) {
            groupData.recentExpenses.forEach(exp => {
              content += `
                <li>
                  <span>${exp.description}</span>
                  <strong>₹${exp.amount.toFixed(2)}</strong>
                  <small>Paid by: ${exp.paidByName || 'Unknown'}</small>
                </li>
              `;
            });
          } else {
            content += `<li>No recent expenses</li>`;
          }
          
          content += `</ul>`;
          
          // Update modal body
          document.getElementById('groupDetailsBody').innerHTML = content;
          
          // Show modal
          document.getElementById('groupDetailsModal').style.display = 'flex';
        } else {
          showNotification('Failed to load group details', 'error');
        }
      } catch (err) {
        console.error('Group details error:', err);
        showNotification('Network error while loading group details', 'error');
      }
    });
  });
  
  // Close group details modal
  const closeGroupDetailsBtn = document.getElementById('closeGroupDetailsBtn');
  if (closeGroupDetailsBtn) {
    closeGroupDetailsBtn.addEventListener('click', function() {
      document.getElementById('groupDetailsModal').style.display = 'none';
    });
  }
}

// Show notification
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // Auto-remove after 3 seconds
  setTimeout(() => {
    notification.classList.add('notification-hide');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Handle settlement verification
function setupSettlementVerification() {
  // Verify settlement buttons
  const verifyButtons = document.querySelectorAll('.verify-settlement-btn');
  if (verifyButtons.length) {
    verifyButtons.forEach(btn => {
    btn.addEventListener('click', async function() {
      if (!confirm('Verify this settlement? This confirms you received the payment.')) return;
      
      const settlementId = this.dataset.id;
      try {
        const response = await fetch(`/settlements/${settlementId}/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          // Show success message
          showNotification('Settlement verified successfully', 'success');
          
          // Update UI to show verified status
          const row = this.closest('tr');
          this.remove(); // Remove verify button
          
          // Add verified indicator
          const statusIndicator = document.createElement('span');
          statusIndicator.className = 'verification-indicator verification-verified';
          statusIndicator.title = 'Verified';
          row.querySelector('.action-cell').appendChild(statusIndicator);
        } else {
          const errorData = await response.json();
          showNotification(errorData.error || 'Failed to verify settlement', 'error');
        }
      } catch (err) {
        console.error('Settlement verification error:', err);
        showNotification('Network error while verifying settlement', 'error');
      }
    });
    });
  }
  
  // Dispute settlement buttons
  const disputeButtons = document.querySelectorAll('.dispute-settlement-btn');
  if (disputeButtons.length) {
    disputeButtons.forEach(btn => {
      btn.addEventListener('click', async function() {
        const reason = prompt('Please provide a reason for disputing this settlement:');
        if (reason === null) return; // User cancelled
        
        const settlementId = this.dataset.id;
        try {
          const response = await fetch(`/settlements/${settlementId}/dispute`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason })
          });
          
          if (response.ok) {
            // Show success message
            showNotification('Settlement disputed', 'warning');
            
            // Update UI to show disputed status
            const row = this.closest('tr');
            this.remove(); // Remove dispute button
            
            // Add disputed indicator
            const statusIndicator = document.createElement('span');
            statusIndicator.className = 'verification-indicator verification-disputed';
            statusIndicator.title = 'Disputed: ' + reason;
            row.querySelector('.action-cell').appendChild(statusIndicator);
          } else {
            const errorData = await response.json();
            showNotification(errorData.error || 'Failed to dispute settlement', 'error');
          }
        } catch (err) {
          console.error('Settlement dispute error:', err);
          showNotification('Network error while disputing settlement', 'error');
        }
      });
    });
  }
}

// Handle dashboard settlement notifications
function setupDashboardSettlements() {
  // Accept settlement buttons from dashboard notifications
  document.querySelectorAll('.accept-settlement-btn').forEach(btn => {
    btn.addEventListener('click', async function() {
      const settlementId = this.dataset.settlementId;
      const amount = this.dataset.amount;
      const debtor = this.dataset.debtor;
      
      if (!confirm(`Accept settlement of ₹${amount} from ${debtor}?`)) return;
      
      try {
        const response = await fetch(`/api/settlements/${settlementId}/accept`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          showNotification('Settlement accepted successfully!', 'success');
          setTimeout(() => window.location.reload(), 1000);
        } else {
          const error = await response.json();
          showNotification(error.error || 'Failed to accept settlement', 'error');
        }
      } catch (err) {
        console.error('Error accepting settlement:', err);
        showNotification('Network error while accepting settlement', 'error');
      }
    });
  });

  // Reject settlement buttons from dashboard notifications
  document.querySelectorAll('.reject-settlement-btn').forEach(btn => {
    btn.addEventListener('click', async function() {
      const settlementId = this.dataset.settlementId;
      const reason = prompt('Please provide a reason for rejection (optional):');
      
      if (reason === null) return; // User cancelled
      
      try {
        const response = await fetch(`/api/settlements/${settlementId}/reject`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ reason })
        });
        
        if (response.ok) {
          showNotification('Settlement rejected', 'info');
          setTimeout(() => window.location.reload(), 1000);
        } else {
          const error = await response.json();
          showNotification(error.error || 'Failed to reject settlement', 'error');
        }
      } catch (err) {
        console.error('Error rejecting settlement:', err);
        showNotification('Network error while rejecting settlement', 'error');
      }
    });
  });
}

// Handle notification actions (Close and Settle Again)
function setupNotificationActions() {
  // Close notification buttons
  document.querySelectorAll('.close-notification-btn').forEach(btn => {
    btn.addEventListener('click', async function() {
      const notificationId = this.dataset.notificationId;
      
      try {
        const response = await fetch(`/api/notifications/${notificationId}/read`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          // Remove notification from UI
          this.closest('.general-notification-item').style.display = 'none';
          showNotification('Notification closed', 'success');
          
          // If no more notifications, hide the entire section
          const notificationsList = document.querySelector('.general-notifications-list');
          const remainingNotifications = notificationsList.querySelectorAll('.general-notification-item:not([style*="display: none"])');
          if (remainingNotifications.length === 0) {
            document.querySelector('.general-notifications-card').style.display = 'none';
          }
        } else {
          showNotification('Failed to close notification', 'error');
        }
      } catch (error) {
        console.error('Error closing notification:', error);
        showNotification('Network error while closing notification', 'error');
      }
    });
  });

  // Settle Again buttons
  document.querySelectorAll('.settle-again-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const notificationId = this.dataset.notificationId;
      const amount = this.dataset.amount;
      const groupId = this.dataset.groupId;

      // Get the creditor from the rejection notification context
      // For now, we'll open the settlement modal without pre-filled data
      // The user will need to select the creditor manually
      
      // Fill settlement form with the amount from the rejected settlement
      document.getElementById('settlementAmount').value = amount;
      document.getElementById('settlementGroupId').value = groupId || '';
      
      // Clear other fields so user can select creditor and debtor
      document.getElementById('settlementDebtorId').value = '';
      document.getElementById('settlementCreditorId').value = '';
      
      // Update modal text
      document.getElementById('settlementDescription').textContent = 
        `Re-submit settlement of ₹${parseFloat(amount).toFixed(2)}`;
      
      // Show settlement modal
      const modal = document.getElementById('settlementModal');
      modal.style.display = 'flex';
      modal.classList.add('active');

      // Mark notification as read when settling again
      fetch(`/api/notifications/${notificationId}/read`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      }).catch(err => console.error('Error marking notification as read:', err));
    });
  });
}

// Browser-side caching functions
function formatCurrency(value) {
  const num = Number(value);
  if (Number.isNaN(num)) {
    return '₹0.00';
  }
  return `₹${num.toFixed(2)}`;
}

function parseCurrencyValue(text) {
  if (!text) return 0;
  const numeric = Number(text.replace(/[^0-9.-]+/g, ''));
  return Number.isNaN(numeric) ? 0 : numeric;
}

function updateSummaryCards(summary = {}) {
  const personalEl = document.querySelector('.personal-spending');
  if (personalEl && summary.personalMonthlyTotal !== undefined) {
    personalEl.textContent = formatCurrency(summary.personalMonthlyTotal);
  }

  const groupEl = document.querySelector('.group-spending');
  if (groupEl && summary.groupMonthlyTotal !== undefined) {
    groupEl.textContent = formatCurrency(summary.groupMonthlyTotal);
  }

  const owedEl = document.querySelector('.total-owed');
  if (owedEl && summary.totalOwed !== undefined) {
    owedEl.textContent = formatCurrency(summary.totalOwed);
  }

  const owedToYouEl = document.querySelector('.total-owed-to-you');
  if (owedToYouEl && summary.totalOwedToUser !== undefined) {
    owedToYouEl.textContent = formatCurrency(summary.totalOwedToUser);
  }
}

function updateGroupSummaryCards(groupSummaries = []) {
  const container = document.querySelector('.group-summary-grid');
  if (!container || !Array.isArray(groupSummaries)) {
    return;
  }

  const existingCards = Array.from(container.querySelectorAll('.group-summary-card'));
  const cardMap = new Map();
  existingCards.forEach((card) => {
    cardMap.set(card.getAttribute('data-group-summary-id'), card);
  });

  groupSummaries.forEach((summary) => {
    if (!summary || !summary.groupId) return;
    let card = cardMap.get(summary.groupId);
    if (!card) {
      card = document.createElement('div');
      card.className = 'summary-card group-summary-card';
      card.setAttribute('data-group-summary-id', summary.groupId);
      card.innerHTML = `
        <div class="summary-card-title group-summary-name"></div>
        <div class="summary-card-value group-summary-share"></div>
        <div class="summary-card-subtitle">Your share this month</div>
        <div class="group-summary-meta">
          <span class="group-summary-total"></span>
          <span class="group-summary-paid"></span>
          <span class="group-summary-members"></span>
        </div>`;
      container.appendChild(card);
      cardMap.set(summary.groupId, card);
    }

    const nameEl = card.querySelector('.group-summary-name');
    if (nameEl) nameEl.textContent = summary.groupName || 'Group';
    const shareEl = card.querySelector('.group-summary-share');
    if (shareEl) shareEl.textContent = formatCurrency(summary.yourShareThisMonth);
    const totalEl = card.querySelector('.group-summary-total');
    if (totalEl) totalEl.textContent = `Total group spend: ${formatCurrency(summary.totalGroupSpendThisMonth)}`;
    const paidEl = card.querySelector('.group-summary-paid');
    if (paidEl) paidEl.textContent = `You paid: ${formatCurrency(summary.youPaidThisMonth)}`;
    const membersEl = card.querySelector('.group-summary-members');
    if (membersEl) membersEl.textContent = `Members: ${summary.memberCount || 0}`;
  });
}

function updateBalancesSection(netBalances, userIdMap) {
  const balancesCard = document.querySelector('.dashboard-sidebar .dashboard-card');
  if (!balancesCard) return;

  const entries = Object.entries(netBalances);
  
  // Find the existing list or the "all settled up" message
  let existingList = balancesCard.querySelector('ul');
  let settledMessage = balancesCard.querySelector('p');
  
  if (entries.length === 0) {
    // Remove list if exists
    if (existingList) {
      existingList.remove();
    }
    // Show or create settled message
    if (!settledMessage) {
      settledMessage = document.createElement('p');
      balancesCard.appendChild(settledMessage);
    }
    settledMessage.textContent = \"You're all settled up!\";
  } else {
    // Remove settled message if exists
    if (settledMessage) {
      settledMessage.remove();
    }
    
    // Create or update list
    if (!existingList) {
      existingList = document.createElement('ul');
      existingList.style.listStyle = 'none';
      existingList.style.padding = '0';
      balancesCard.appendChild(existingList);
    }
    
    // Clear existing items
    existingList.innerHTML = '';
    
    // Add balance items
    entries.forEach(([key, balanceInfo]) => {
      const [debtor, creditor] = key.split(':');
      const isDebtor = debtor === currentUserId;
      const isCreditor = creditor === currentUserId;
      
      let debtorName, creditorName;
      if (isDebtor) {
        debtorName = 'You';
      } else if (userIdMap[debtor]) {
        debtorName = userIdMap[debtor].username;
      } else {
        debtorName = `User (${debtor.slice(-5)})`;
      }
      
      if (isCreditor) {
        creditorName = 'You';
      } else if (userIdMap[creditor]) {
        creditorName = userIdMap[creditor].username;
      } else {
        creditorName = `User (${creditor.slice(-5)})`;
      }
      
      const li = document.createElement('li');
      li.className = isDebtor ? 'debtor-item' : 'creditor-item';
      li.style.marginBottom = '0.5rem';
      li.style.padding = '0.5rem';
      li.style.borderRadius = 'var(--radius-sm)';
      
      let displayText;
      if (isDebtor) {
        displayText = `You owe <strong>${creditorName}</strong>`;
      } else if (isCreditor) {
        displayText = `<strong>${debtorName}</strong> owes you`;
      } else {
        displayText = `${debtorName} owes ${creditorName}`;
      }
      
      li.innerHTML = `
        <span>${displayText}</span>
        <strong style="float: right;">₹${balanceInfo.amount.toFixed(2)}</strong>
        <div class="expense-actions">
          <button class="settle-balance-btn action-btn action-btn-secondary" 
                  data-debtor="${debtor}" 
                  data-creditor="${creditor}" 
                  data-amount="${balanceInfo.amount}"
                  data-debtor-name="${debtorName}"
                  data-creditor-name="${creditorName}">
            Settle
          </button>
        </div>
      `;
      
      existingList.appendChild(li);
    });
    
    // Re-attach event listeners for new settle buttons
    setupSettlementActions();
  }
}

function cacheDashboardPayload(payload = {}) {
  if (!window.DashboardCache || !currentUserId) return;
  const entry = {
    summary: payload.summary || payload,
    groupSummaries: payload.groupSummaries || []
  };
  window.DashboardCache.cacheDashboard(currentUserId, entry);
}

function loadCachedDashboardData() {
  if (!window.DashboardCache || !currentUserId) return;
  const cached = window.DashboardCache.getDashboard(currentUserId);
  if (!cached) return;
  if (cached.summary) {
    updateSummaryCards(cached.summary);
  }
  if (cached.groupSummaries) {
    updateGroupSummaryCards(cached.groupSummaries);
  }
}

function primeDashboardCacheFromDom() {
  if (!window.DashboardCache || !currentUserId) return;
  try {
    const summary = {
      personalMonthlyTotal: parseCurrencyValue(document.querySelector('.personal-spending')?.textContent),
      groupMonthlyTotal: parseCurrencyValue(document.querySelector('.group-spending')?.textContent),
      totalOwed: parseCurrencyValue(document.querySelector('.total-owed')?.textContent),
      totalOwedToUser: parseCurrencyValue(document.querySelector('.total-owed-to-you')?.textContent)
    };

    const groupSummaries = Array.from(document.querySelectorAll('.group-summary-card'))
      .map((card) => ({
        groupId: card.getAttribute('data-group-summary-id'),
        groupName: card.querySelector('.group-summary-name')?.textContent || 'Group',
        yourShareThisMonth: parseCurrencyValue(card.querySelector('.group-summary-share')?.textContent),
        totalGroupSpendThisMonth: parseCurrencyValue(card.querySelector('.group-summary-total')?.textContent),
        youPaidThisMonth: parseCurrencyValue(card.querySelector('.group-summary-paid')?.textContent),
        memberCount: parseInt(card.querySelector('.group-summary-members')?.textContent?.replace(/[^0-9]/g, ''), 10) || 0
      }))
      .filter((entry) => !!entry.groupId);

    cacheDashboardPayload({ summary, groupSummaries });
  } catch (error) {
    console.log('Dashboard cache prime error:', error);
  }
}

async function refreshDashboardSummary() {
  if (!currentUserId) return;
  try {
    const response = await fetch('/api/dashboard/summary?force=true', {
      headers: {
        'Accept': 'application/json'
      }
    });
    if (!response.ok) {
      throw new Error('Failed to fetch dashboard summary');
    }
    const payload = await response.json();
    if (!payload || !payload.summary) {
      return;
    }
    updateSummaryCards(payload.summary);
    if (payload.groupSummaries) {
      updateGroupSummaryCards(payload.groupSummaries);
    }
    if (payload.netBalances && payload.userIdMap) {
      updateBalancesSection(payload.netBalances, payload.userIdMap);
    }
    cacheDashboardPayload(payload);
  } catch (error) {
    console.error('Dashboard summary fetch error:', error);
    loadCachedDashboardData();
  }
}

// Offline expense submission
function submitOfflineExpense(formData) {
  if (!window.OfflineStorage) return false;
  
  try {
    window.OfflineStorage.storeExpense(formData);
    showNotification('Expense saved offline - will sync when online', 'info');
    return true;
  } catch (error) {
    console.log('Offline storage error:', error);
    return false;
  }
}

// Enhanced form submission with offline support
function enhanceExpenseForm() {
  const expenseForm = document.querySelector('#expenseForm');
  if (!expenseForm) return;
  
  expenseForm.addEventListener('submit', function(e) {
    // If offline, try to store for later submission
    if (!navigator.onLine && window.OfflineStorage) {
      e.preventDefault();
      
      const formData = new FormData(this);
      const expenseData = Object.fromEntries(formData);
      
      if (submitOfflineExpense(expenseData)) {
        // Clear form after offline submission
        this.reset();
      }
    }
  });
}

// Initialize all dashboard functionality
document.addEventListener('DOMContentLoaded', function() {
  // Ensure settlement modal is closed on page load
  const settlementModal = document.getElementById('settlementModal');
  if (settlementModal) {
    settlementModal.style.display = 'none';
    settlementModal.classList.remove('active');
    
    // Clear form fields
    const settlementForm = document.getElementById('settlementForm');
    if (settlementForm) {
      settlementForm.reset();
      // Explicitly clear the hidden ID fields
      const debtorIdField = document.getElementById('settlementDebtorId');
      const creditorIdField = document.getElementById('settlementCreditorId');
      if (debtorIdField) debtorIdField.value = '';
      if (creditorIdField) creditorIdField.value = '';
    }
  }
  
  setupExpenseActions();
  setupSettlementActions();
  setupGroupDetails();
  setupSettlementVerification();
  setupDashboardSettlements();
  setupNotificationActions();
  enhanceExpenseForm();
});