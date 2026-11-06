import React, {useState} from 'react';
import {Calculator, Field, Result, fmt, parse} from './parts';

type Token = {amount: string; price: string; ltv: string; threshold: string};

const START: Record<'ETH' | 'NEAR', Token> = {
  ETH: {amount: '0.5', price: '2260', ltv: '70', threshold: '80'},
  NEAR: {amount: '0', price: '2.5', ltv: '70', threshold: '80'},
};

/** Borrowing power and health factor of a loan with ETH and NEAR collateral. */
export default function HealthCalculator() {
  const [tokens, setTokens] = useState(START);
  const [debt, setDebt] = useState('500');

  const set = (symbol: keyof typeof START, key: keyof Token) => (value: string) =>
    setTokens((current) => ({...current, [symbol]: {...current[symbol], [key]: value}}));

  const rows = Object.values(tokens).map((token) => {
    const value = parse(token.amount || '0') * parse(token.price);
    return {
      value,
      power: (value * parse(token.ltv)) / 100,
      weighted: (value * parse(token.threshold)) / 100,
    };
  });
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const power = rows.reduce((sum, row) => sum + row.power, 0);
  const weighted = rows.reduce((sum, row) => sum + row.weighted, 0);
  const face = parse(debt || '0');
  const health = face > 0 ? weighted / face : Infinity;

  return (
    <Calculator
      title="Health calculator"
      note="Debt is the debt face: principal plus the fixed interest to maturity. The contract values collateral at the oracle price minus its confidence interval and USDC at its price plus it, so its numbers come out slightly more conservative than these.">
      {(Object.keys(tokens) as (keyof typeof START)[]).map((symbol) => (
        <div key={symbol}>
          <p className="calc__section">{symbol} collateral</p>
          <div className="calc__grid">
            <Field label="Amount" suffix={symbol} value={tokens[symbol].amount} onChange={set(symbol, 'amount')} />
            <Field label="Price" suffix="USD" value={tokens[symbol].price} onChange={set(symbol, 'price')} />
            <Field label="Max LTV" suffix="%" value={tokens[symbol].ltv} onChange={set(symbol, 'ltv')} />
            <Field
              label="Liquidation threshold"
              suffix="%"
              value={tokens[symbol].threshold}
              onChange={set(symbol, 'threshold')}
            />
          </div>
        </div>
      ))}
      <p className="calc__section">Loan</p>
      <div className="calc__grid">
        <Field label="Debt face" suffix="USDC" value={debt} onChange={setDebt} />
      </div>
      <div className="calc__results">
        <Result label="Collateral value" value={`$${fmt(total)}`} />
        <Result label="Borrowing power (debt face)" value={`${fmt(power)} USDC`} />
        <Result label="Room left to borrow (face)" value={`${fmt(Math.max(power - face, 0))} USDC`} />
        <Result
          label="Health factor"
          value={face > 0 ? fmt(health) : 'no debt'}
          tone={face > 0 ? (health >= 1 ? 'good' : 'bad') : undefined}
        />
      </div>
    </Calculator>
  );
}
