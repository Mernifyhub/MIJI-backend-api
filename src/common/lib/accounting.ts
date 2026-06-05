// src/common/lib/accounting.ts

type MoneyLike = number | string | null | undefined;

function toNum(value: MoneyLike): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function getAccountSnapshot(params: {
  balance: MoneyLike;
  creditLimit: MoneyLike;
  usedLimit: MoneyLike;
}) {
  const rawBalance = toNum(params.balance);
  const walletBalance = Math.max(0, rawBalance);
  const creditLimit = Math.max(0, toNum(params.creditLimit));
  const usedLimit = Math.max(0, toNum(params.usedLimit));
  const availableCredit = Math.max(0, creditLimit - usedLimit);
  const totalAvailableToBook = walletBalance + availableCredit;

  return {
    rawBalance,
    walletBalance,
    creditLimit,
    usedLimit,
    availableCredit,
    totalAvailableToBook,
  };
}

export function computeBookingPayment(params: {
  balance: MoneyLike;
  creditLimit: MoneyLike;
  usedLimit: MoneyLike;
  fare: MoneyLike;
}){
  const fare = Math.max(0, toNum(params.fare));
  if (fare <= 0) throw new Error('INVALID_FARE');

  const account = getAccountSnapshot(params);

  if (account.totalAvailableToBook < fare) {
    throw new Error('INSUFFICIENT_BALANCE');
  }

  const fromBalance = Math.min(account.walletBalance, fare);
  const fromCredit = fare - fromBalance;

  const paymentMethod: 'BALANCE' | 'CREDIT' | 'MIXED' =
    fromCredit === 0
      ? 'BALANCE'
      : fromBalance === 0
        ? 'CREDIT'
        : 'MIXED';

  const newBalance = account.walletBalance - fromBalance;
  const newUsedLimit = account.usedLimit + fromCredit;

  return {
    ...account,
    fare,
    fromBalance,
    fromCredit,
    paymentMethod,
    newBalance,
    newUsedLimit,
  };
}

export function computeDepositApplication(params: {
  balance: MoneyLike;
  usedLimit: MoneyLike;
  amount: MoneyLike;
}) {
  const amount = Math.max(0, toNum(params.amount));
  if (amount <= 0) throw new Error('INVALID_DEPOSIT_AMOUNT');

  const walletBalance = Math.max(0, toNum(params.balance));
  const usedLimit = Math.max(0, toNum(params.usedLimit));

  const appliedToCredit = Math.min(amount, usedLimit);
  const addedToWallet = amount - appliedToCredit;

  const newUsedLimit = usedLimit - appliedToCredit;
  const newBalance = walletBalance + addedToWallet;

  return {
    amount,
    walletBalance,
    usedLimit,
    appliedToCredit,
    addedToWallet,
    newUsedLimit,
    newBalance,
  };
}