const refreshPlaidTransactions = async () => {
  try {
    const response = await fetch(`${apiUrl}/api/plaid/transactions?days=90`);
    const transactions = await response.json();

    const promises = transactions.map(async (transaction) => {
      const { transaction_id, amount, date } = transaction;

      // Check for duplicate transactions
      const existingTransaction = await firebase.firestore().collection('transactions')
        .where('transaction_id', '==', transaction_id)
        .get();

      if (existingTransaction.empty) {
        // Store new transaction in Firebase
        await firebase.firestore().collection('transactions').add(transaction);

        // Match bills with transactions
        const matchedBills = findMatchingTransactionForBill(transaction);
        matchedBills.forEach(async (bill) => {
          const billDate = new Date(bill.due_date);
          const transactionDate = new Date(date);
          const dayDifference = (transactionDate - billDate) / (1000 * 60 * 60 * 24);

          // Auto-mark bills as paid if within 3 days tolerance
          if (dayDifference >= 0 && dayDifference <= 3) {
            await RecurringBillManager.markBillAsPaid(bill.id);
            await firebase.firestore().collection('bill_payments').add({
              bill_id: bill.id,
              transaction_id,
              amount,
              date,
              created_at: new Date(),
            });

            // Show success notification
            showNotification(`Matched bill ${bill.name} with transaction of $${amount}`);
          }
        });
      }
    });

    await Promise.all(promises);
  } catch (error) {
    console.error("Error refreshing Plaid transactions:", error);
    showNotification("Failed to refresh transactions. Please try again.");
  }
};
