import React, {useState} from 'react';
import {Calculator, Field, Result, fmt, parse} from './parts';

/** Fixed APR to note face and discount price, simple interest on a 365-day year. */
export default function RateCalculator() {
  const [principal, setPrincipal] = useState('1000');
  const [apr, setApr] = useState('8');
  const [days, setDays] = useState('21');

  const p = parse(principal);
  const r = parse(apr) / 100;
  const t = parse(days) / 365;
  const growth = 1 + r * t;
  const face = p * growth;
  const price = 1 / growth;

  return (
    <Calculator
      title="Rate calculator"
      note="Uses the contract's formula: face = principal × (1 + APR × days / 365). The contract counts time in nanoseconds up to the maturity, so the exact face depends on the block in which the order fills.">
      <div className="calc__grid">
        <Field label="Principal" suffix="USDC" value={principal} onChange={setPrincipal} />
        <Field label="Fixed APR" suffix="%" value={apr} onChange={setApr} />
        <Field label="Days to maturity" value={days} onChange={setDays} />
      </div>
      <div className="calc__results">
        <Result label="Face at maturity" value={`${fmt(face)} USDC`} />
        <Result label="Interest" value={`${fmt(face - p)} USDC`} />
        <Result label="Price of a 1 USDC note today" value={`${fmt(price, 6)} USDC`} />
        <Result label="Return over the term" value={`${fmt((growth - 1) * 100, 4)} %`} />
      </div>
    </Calculator>
  );
}
