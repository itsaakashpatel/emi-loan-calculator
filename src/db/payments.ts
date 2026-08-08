import { getDb } from './client';

export interface PaymentRecord {
  installmentNo: number;
  dueDate: string;
  amountDue: number;
  paidDate: string | null;
  amountPaid: number | null;
}

interface Row {
  installment_no: number;
  due_date: string;
  amount_due: number;
  paid_date: string | null;
  amount_paid: number | null;
}

export async function listPayments(loanId: number): Promise<PaymentRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(
    'SELECT installment_no, due_date, amount_due, paid_date, amount_paid FROM payments WHERE loan_id = ? ORDER BY installment_no',
    loanId,
  );
  return rows.map((r) => ({
    installmentNo: r.installment_no,
    dueDate: r.due_date,
    amountDue: r.amount_due,
    paidDate: r.paid_date,
    amountPaid: r.amount_paid,
  }));
}

/** Records an installment as paid. Idempotent per (loan, installment). */
export async function markPaid(
  loanId: number,
  installment: { no: number; dueDate: string; amountDue: number },
  paidDate: string,
  amountPaid: number,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO payments (loan_id, installment_no, due_date, amount_due, paid_date, amount_paid)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(loan_id, installment_no)
       DO UPDATE SET paid_date = excluded.paid_date, amount_paid = excluded.amount_paid,
                     due_date = excluded.due_date, amount_due = excluded.amount_due`,
    loanId,
    installment.no,
    installment.dueDate,
    installment.amountDue,
    paidDate,
    amountPaid,
  );
}

export async function markUnpaid(loanId: number, installmentNo: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM payments WHERE loan_id = ? AND installment_no = ?', loanId, installmentNo);
}

/**
 * Marks every installment up to and including `installmentNo` as paid on its due date — the
 * "I've been paying this for a while" case when adding an existing loan.
 */
export async function markPaidThrough(
  loanId: number,
  installments: ReadonlyArray<{ no: number; dueDate: string; amountDue: number }>,
  installmentNo: number,
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const installment of installments) {
      if (installment.no > installmentNo) break;
      await db.runAsync(
        `INSERT INTO payments (loan_id, installment_no, due_date, amount_due, paid_date, amount_paid)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(loan_id, installment_no)
           DO UPDATE SET paid_date = excluded.paid_date, amount_paid = excluded.amount_paid`,
        loanId,
        installment.no,
        installment.dueDate,
        installment.amountDue,
        installment.dueDate,
        installment.amountDue,
      );
    }
  });
}
