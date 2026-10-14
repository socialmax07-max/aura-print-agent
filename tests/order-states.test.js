/**
 * AURA PRINT PRO — AUTOMATED ORDER STATE MACHINE TEST SUITE
 * File: tests/order-states.test.js
 * Test Runner: Node.js Native Test Runner (node:test)
 * Owner: Sabir Ansari
 * 
 * Verifies:
 * - State machine enum definitions
 * - UPI & Cash payment linear progression
 * - Transition guards & illegal transition blocking
 * - Retry and failure recovery pathways
 * - Terminal state immutability
 * - Metadata integrity (labels, themes, descriptions)
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ORDER_STATES,
  PERMITTED_TRANSITIONS,
  isValidTransition,
  isTerminalState,
  STATE_METADATA
} = require('../src/shared/order-states.js');

test('Order States Finite State Machine', async (t) => {

  await t.test('1. Enumeration Integrity', () => {
    // Assert all fundamental core states exist
    const expectedStates = [
      'UPLOADED',
      'AWAITING_PAYMENT',
      'PAYMENT_REVIEW',
      'AWAITING_CASH_CONFIRMATION',
      'PAYMENT_CONFIRMED',
      'CASH_CONFIRMED',
      'PAYMENT_REJECTED',
      'PRINT_QUEUED',
      'PRINTING',
      'PRINTED',
      'PRINT_FAILED',
      'CANCELLED'
    ];

    expectedStates.forEach(state => {
      assert.ok(
        ORDER_STATES[state],
        `Expected state enum "${state}" must be defined in ORDER_STATES`
      );
      assert.strictEqual(
        ORDER_STATES[state],
        state,
        `Enum value for "${state}" must match string "${state}"`
      );
    });
  });

  await t.test('2. Happy Path — Online UPI Workflow', () => {
    // 1. Customer uploads document
    assert.strictEqual(
      isValidTransition(ORDER_STATES.UPLOADED, ORDER_STATES.AWAITING_PAYMENT),
      true,
      'UPLOADED -> AWAITING_PAYMENT must be valid'
    );

    // 2. Customer submits UPI UTR or payment is placed under review
    assert.strictEqual(
      isValidTransition(ORDER_STATES.AWAITING_PAYMENT, ORDER_STATES.PAYMENT_REVIEW),
      true,
      'AWAITING_PAYMENT -> PAYMENT_REVIEW must be valid'
    );

    // 3. Payment is confirmed by operator or gateway webhook
    assert.strictEqual(
      isValidTransition(ORDER_STATES.PAYMENT_REVIEW, ORDER_STATES.PAYMENT_CONFIRMED),
      true,
      'PAYMENT_REVIEW -> PAYMENT_CONFIRMED must be valid'
    );

    // 4. Job is queued for Windows Print Agent
    assert.strictEqual(
      isValidTransition(ORDER_STATES.PAYMENT_CONFIRMED, ORDER_STATES.PRINT_QUEUED),
      true,
      'PAYMENT_CONFIRMED -> PRINT_QUEUED must be valid'
    );

    // 5. Windows agent claims the job and begins spooling
    assert.strictEqual(
      isValidTransition(ORDER_STATES.PRINT_QUEUED, ORDER_STATES.PRINTING),
      true,
      'PRINT_QUEUED -> PRINTING must be valid'
    );

    // 6. Windows agent acknowledges physical spool completion
    assert.strictEqual(
      isValidTransition(ORDER_STATES.PRINTING, ORDER_STATES.PRINTED),
      true,
      'PRINTING -> PRINTED must be valid'
    );
  });

  await t.test('3. Happy Path — Counter Cash Workflow', () => {
    // 1. Document uploaded and customer selects Cash option
    assert.strictEqual(
      isValidTransition(ORDER_STATES.UPLOADED, ORDER_STATES.AWAITING_CASH_CONFIRMATION),
      true,
      'UPLOADED -> AWAITING_CASH_CONFIRMATION must be valid'
    );

    assert.strictEqual(
      isValidTransition(ORDER_STATES.AWAITING_PAYMENT, ORDER_STATES.AWAITING_CASH_CONFIRMATION),
      true,
      'AWAITING_PAYMENT -> AWAITING_CASH_CONFIRMATION must be valid'
    );

    // 2. Shopkeeper enters 4-6 digit operator PIN
    assert.strictEqual(
      isValidTransition(ORDER_STATES.AWAITING_CASH_CONFIRMATION, ORDER_STATES.CASH_CONFIRMED),
      true,
      'AWAITING_CASH_CONFIRMATION -> CASH_CONFIRMED must be valid'
    );

    // 3. Enters print spooler queue
    assert.strictEqual(
      isValidTransition(ORDER_STATES.CASH_CONFIRMED, ORDER_STATES.PRINT_QUEUED),
      true,
      'CASH_CONFIRMED -> PRINT_QUEUED must be valid'
    );

    // 4. Spooling to finished
    assert.strictEqual(
      isValidTransition(ORDER_STATES.PRINT_QUEUED, ORDER_STATES.PRINTING),
      true,
      'PRINT_QUEUED -> PRINTING must be valid'
    );
    assert.strictEqual(
      isValidTransition(ORDER_STATES.PRINTING, ORDER_STATES.PRINTED),
      true,
      'PRINTING -> PRINTED must be valid'
    );
  });

  await t.test('4. Branching — Payment Rejection & Customer Resubmission', () => {
    // Operator rejects unreceived UPI transfer
    assert.strictEqual(
      isValidTransition(ORDER_STATES.PAYMENT_REVIEW, ORDER_STATES.PAYMENT_REJECTED),
      true,
      'PAYMENT_REVIEW -> PAYMENT_REJECTED must be valid'
    );

    // Customer re-enters correct UPI UTR from rejection screen
    assert.strictEqual(
      isValidTransition(ORDER_STATES.PAYMENT_REJECTED, ORDER_STATES.PAYMENT_REVIEW),
      true,
      'PAYMENT_REJECTED -> PAYMENT_REVIEW must be allowed for resubmission'
    );

    // Or switches to Counter Cash
    assert.strictEqual(
      isValidTransition(ORDER_STATES.PAYMENT_REJECTED, ORDER_STATES.AWAITING_CASH_CONFIRMATION),
      true,
      'PAYMENT_REJECTED -> AWAITING_CASH_CONFIRMATION must be allowed'
    );
  });

  await t.test('5. Branching — Spooler Failure & Recovery', () => {
    // Windows Print Agent encounters paper jam or offline driver
    assert.strictEqual(
      isValidTransition(ORDER_STATES.PRINTING, ORDER_STATES.PRINT_FAILED),
      true,
      'PRINTING -> PRINT_FAILED must be valid on hardware error'
    );

    // Operator clears jam and clicks "Retry Print"
    assert.strictEqual(
      isValidTransition(ORDER_STATES.PRINT_FAILED, ORDER_STATES.PRINT_QUEUED),
      true,
      'PRINT_FAILED -> PRINT_QUEUED must be allowed to retry'
    );

    // Direct manual print trigger from failed state
    assert.strictEqual(
      isValidTransition(ORDER_STATES.PRINT_FAILED, ORDER_STATES.PRINTING),
      true,
      'PRINT_FAILED -> PRINTING must be allowed on manual force-print'
    );
  });

  await t.test('6. Cancellation Rules', () => {
    // Pre-print stages can be cancelled
    const cancellableStates = [
      ORDER_STATES.UPLOADED,
      ORDER_STATES.AWAITING_PAYMENT,
      ORDER_STATES.PAYMENT_REVIEW,
      ORDER_STATES.AWAITING_CASH_CONFIRMATION,
      ORDER_STATES.PAYMENT_REJECTED,
      ORDER_STATES.PRINT_FAILED
    ];

    cancellableStates.forEach(state => {
      assert.strictEqual(
        isValidTransition(state, ORDER_STATES.CANCELLED),
        true,
        `Stage ${state} must be cancellable`
      );
    });

    // Orders that have already been printed CANNOT be cancelled
    assert.strictEqual(
      isValidTransition(ORDER_STATES.PRINTED, ORDER_STATES.CANCELLED),
      false,
      'PRINTED orders must not transition to CANCELLED'
    );
  });

  await t.test('7. Illegal Regression & Backward Transitions', () => {
    // Attempting to move backward must be strictly rejected
    assert.strictEqual(
      isValidTransition(ORDER_STATES.PRINTED, ORDER_STATES.PRINTING),
      false,
      'PRINTED cannot revert back to PRINTING'
    );

    assert.strictEqual(
      isValidTransition(ORDER_STATES.PRINTED, ORDER_STATES.UPLOADED),
      false,
      'PRINTED cannot revert back to UPLOADED'
    );

    assert.strictEqual(
      isValidTransition(ORDER_STATES.PRINT_QUEUED, ORDER_STATES.AWAITING_PAYMENT),
      false,
      'PRINT_QUEUED cannot revert back to AWAITING_PAYMENT'
    );

    assert.strictEqual(
      isValidTransition(ORDER_STATES.CASH_CONFIRMED, ORDER_STATES.UPLOADED),
      false,
      'CASH_CONFIRMED cannot revert back to UPLOADED'
    );
  });

  await t.test('8. Illegal Forward Skipping Transitions', () => {
    // Skipping mandatory intermediate steps must be rejected
    assert.strictEqual(
      isValidTransition(ORDER_STATES.UPLOADED, ORDER_STATES.PRINTED),
      false,
      'UPLOADED cannot jump directly to PRINTED without payment and spooling'
    );

    assert.strictEqual(
      isValidTransition(ORDER_STATES.AWAITING_PAYMENT, ORDER_STATES.PRINTING),
      false,
      'AWAITING_PAYMENT cannot jump directly to PRINTING'
    );

    assert.strictEqual(
      isValidTransition(ORDER_STATES.PAYMENT_REVIEW, ORDER_STATES.PRINTED),
      false,
      'PAYMENT_REVIEW cannot jump directly to PRINTED without verification'
    );
  });

  await t.test('9. Terminal State Immutability', () => {
    assert.strictEqual(
      isTerminalState(ORDER_STATES.PRINTED),
      true,
      'PRINTED must be recognized as a terminal state'
    );

    assert.strictEqual(
      isTerminalState(ORDER_STATES.CANCELLED),
      true,
      'CANCELLED must be recognized as a terminal state'
    );

    // Terminal states cannot transition to ANY other state
    Object.values(ORDER_STATES).forEach(targetState => {
      assert.strictEqual(
        isValidTransition(ORDER_STATES.PRINTED, targetState),
        false,
        `PRINTED cannot transition to ${targetState}`
      );

      assert.strictEqual(
        isValidTransition(ORDER_STATES.CANCELLED, targetState),
        false,
        `CANCELLED cannot transition to ${targetState}`
      );
    });
  });

  await t.test('10. Edge Cases & Invalid State Handlers', () => {
    assert.strictEqual(
      isValidTransition(null, ORDER_STATES.UPLOADED),
      false,
      'null current state must return false'
    );

    assert.strictEqual(
      isValidTransition(ORDER_STATES.UPLOADED, undefined),
      false,
      'undefined target state must return false'
    );

    assert.strictEqual(
      isValidTransition('NON_EXISTENT_STATE', ORDER_STATES.PRINTED),
      false,
      'Arbitrary string current state must return false'
    );

    assert.strictEqual(
      isValidTransition(ORDER_STATES.UPLOADED, 'UNKNOWN_TARGET_STATE'),
      false,
      'Arbitrary target state must return false'
    );
  });

  await t.test('11. UI State Metadata Integrity', () => {
    // Every state in ORDER_STATES must have complete UI metadata
    Object.values(ORDER_STATES).forEach(state => {
      const meta = STATE_METADATA[state];
      assert.ok(meta, `Metadata entry must exist for state "${state}"`);

      assert.ok(
        typeof meta.label === 'string' && meta.label.length > 0,
        `State "${state}" must have a non-empty human-readable label`
      );

      assert.ok(
        typeof meta.theme === 'string' && ['primary', 'secondary', 'success', 'warning', 'danger', 'info', 'neutral'].includes(meta.theme),
        `State "${state}" must have a valid badge theme color (got "${meta.theme}")`
      );

      assert.ok(
        typeof meta.description === 'string' && meta.description.length > 0,
        `State "${state}" must provide customer/operator guidance description`
      );
    });
  });

});
