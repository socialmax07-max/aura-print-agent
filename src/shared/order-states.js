/**
 * AURA PRINT PRO — ORDER LIFECYCLE & STATE MACHINE
 * Owner: Sabir Ansari
 * 
 * Strict lifecycle transition definitions:
 * Unpaid or rejected orders are blocked by invariant guards from reaching PRINT_QUEUED.
 */

export const ORDER_STATES = Object.freeze({
  AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  PAYMENT_REVIEW: 'PAYMENT_REVIEW',
  PAYMENT_CONFIRMED: 'PAYMENT_CONFIRMED',
  AWAITING_CASH_CONFIRMATION: 'AWAITING_CASH_CONFIRMATION',
  CASH_CONFIRMED: 'CASH_CONFIRMED',
  PRINT_QUEUED: 'PRINT_QUEUED',
  PRINTING: 'PRINTING',
  PRINTED: 'PRINTED',
  PRINT_FAILED: 'PRINT_FAILED',
  CANCELLED: 'CANCELLED',
  PAYMENT_REJECTED: 'PAYMENT_REJECTED'
});

/**
 * Permitted transitions graph.
 * Key: current state -> Value: Array of allowed next states.
 */
export const ALLOWED_TRANSITIONS = Object.freeze({
  [ORDER_STATES.AWAITING_PAYMENT]: Object.freeze([
    ORDER_STATES.PAYMENT_REVIEW,
    ORDER_STATES.AWAITING_CASH_CONFIRMATION,
    ORDER_STATES.CANCELLED
  ]),

  [ORDER_STATES.PAYMENT_REVIEW]: Object.freeze([
    ORDER_STATES.PAYMENT_CONFIRMED,
    ORDER_STATES.PAYMENT_REJECTED,
    ORDER_STATES.CANCELLED
  ]),

  [ORDER_STATES.AWAITING_CASH_CONFIRMATION]: Object.freeze([
    ORDER_STATES.CASH_CONFIRMED,
    ORDER_STATES.CANCELLED,
    ORDER_STATES.PAYMENT_REJECTED
  ]),

  // Confirmed payment moves immediately to print queue or can be cancelled by shopkeeper
  [ORDER_STATES.PAYMENT_CONFIRMED]: Object.freeze([
    ORDER_STATES.PRINT_QUEUED,
    ORDER_STATES.CANCELLED
  ]),

  [ORDER_STATES.CASH_CONFIRMED]: Object.freeze([
    ORDER_STATES.PRINT_QUEUED,
    ORDER_STATES.CANCELLED
  ]),

  // Queue dispatch states
  [ORDER_STATES.PRINT_QUEUED]: Object.freeze([
    ORDER_STATES.PRINTING,
    ORDER_STATES.PRINT_FAILED,
    ORDER_STATES.CANCELLED
  ]),

  [ORDER_STATES.PRINTING]: Object.freeze([
    ORDER_STATES.PRINTED,
    ORDER_STATES.PRINT_FAILED
  ]),

  // In case of spooler failure, print can be retried or marked cancelled
  [ORDER_STATES.PRINT_FAILED]: Object.freeze([
    ORDER_STATES.PRINT_QUEUED,
    ORDER_STATES.CANCELLED
  ]),

  // Terminal states - no further transitions permitted
  [ORDER_STATES.PRINTED]: Object.freeze([]),
  [ORDER_STATES.CANCELLED]: Object.freeze([]),
  [ORDER_STATES.PAYMENT_REJECTED]: Object.freeze([])
});

/**
 * Human-readable badge text and UI semantic variants
 */
export const STATE_METADATA = Object.freeze({
  [ORDER_STATES.AWAITING_PAYMENT]: {
    label: 'Awaiting Payment',
    labelHi: 'भुगतान प्रतीक्षित',
    theme: 'warning',
    isPaid: false,
    canCustomerCancel: true
  },
  [ORDER_STATES.PAYMENT_REVIEW]: {
    label: 'Under Verification',
    labelHi: 'सत्यापन जारी',
    theme: 'info',
    isPaid: false,
    canCustomerCancel: false
  },
  [ORDER_STATES.AWAITING_CASH_CONFIRMATION]: {
    label: 'Cash Pending at Counter',
    labelHi: 'काउंटर पर नकद भुगतान लंबित',
    theme: 'warning',
    isPaid: false,
    canCustomerCancel: true
  },
  [ORDER_STATES.PAYMENT_CONFIRMED]: {
    label: 'UPI Confirmed',
    labelHi: 'UPI भुगतान सफल',
    theme: 'success',
    isPaid: true,
    canCustomerCancel: false
  },
  [ORDER_STATES.CASH_CONFIRMED]: {
    label: 'Cash Received',
    labelHi: 'नकद प्राप्त हुआ',
    theme: 'success',
    isPaid: true,
    canCustomerCancel: false
  },
  [ORDER_STATES.PRINT_QUEUED]: {
    label: 'In Print Queue',
    labelHi: 'प्रिंट कतार में',
    theme: 'primary',
    isPaid: true,
    canCustomerCancel: false
  },
  [ORDER_STATES.PRINTING]: {
    label: 'Printing Document',
    labelHi: 'प्रिंटिंग जारी है',
    theme: 'primary',
    isPaid: true,
    canCustomerCancel: false
  },
  [ORDER_STATES.PRINTED]: {
    label: 'Printed & Ready',
    labelHi: 'प्रिंट पूर्ण',
    theme: 'neutral',
    isPaid: true,
    canCustomerCancel: false
  },
  [ORDER_STATES.PRINT_FAILED]: {
    label: 'Printer Error',
    labelHi: 'प्रिंटर त्रुटि',
    theme: 'danger',
    isPaid: true,
    canCustomerCancel: false
  },
  [ORDER_STATES.CANCELLED]: {
    label: 'Cancelled',
    labelHi: 'रद्द किया गया',
    theme: 'danger',
    isPaid: false,
    canCustomerCancel: false
  },
  [ORDER_STATES.PAYMENT_REJECTED]: {
    label: 'Payment Not Found',
    labelHi: 'भुगतान अस्वीकृत',
    theme: 'danger',
    isPaid: false,
    canCustomerCancel: false
  }
});

/**
 * Validates if moving from currentState to nextState is legally permitted.
 * @param {string} currentState
 * @param {string} nextState
 * @returns {boolean}
 */
export function canTransition(currentState, nextState) {
  if (!ORDER_STATES[currentState] || !ORDER_STATES[nextState]) {
    return false;
  }
  const allowed = ALLOWED_TRANSITIONS[currentState];
  return Array.isArray(allowed) && allowed.includes(nextState);
}

/**
 * Checks whether an order is genuinely verified and eligible for sending to printer.
 * @param {string} state
 * @returns {boolean}
 */
export function isOrderPrintable(state) {
  const printableStates = [
    ORDER_STATES.PRINT_QUEUED,
    ORDER_STATES.PRINTING,
    ORDER_STATES.PRINT_FAILED
  ];
  return printableStates.includes(state);
}

/**
 * Checks whether an order is in a terminal state that can never change again.
 * @param {string} state
 * @returns {boolean}
 */
export function isTerminalState(state) {
  const terminalStates = [
    ORDER_STATES.PRINTED,
    ORDER_STATES.CANCELLED,
    ORDER_STATES.PAYMENT_REJECTED
  ];
  return terminalStates.includes(state);
}

/**
 * Enforces server-side transition assertion. Throws an informative error if invalid.
 * @param {string} currentState 
 * @param {string} nextState 
 * @param {string} actor - e.g., 'CUSTOMER', 'OPERATOR', 'PRINT_AGENT'
 */
export function assertValidTransition(currentState, nextState, actor = 'SYSTEM') {
  if (!canTransition(currentState, nextState)) {
    throw new Error(
      `Illegal order transition rejected by server: cannot move from '${currentState}' to '${nextState}' by actor [${actor}].`
    );
  }
}

// CommonJS support for Netlify functions and Jest runner
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ORDER_STATES,
    ALLOWED_TRANSITIONS,
    STATE_METADATA,
    canTransition,
    isOrderPrintable,
    isTerminalState,
    assertValidTransition
  };
}
