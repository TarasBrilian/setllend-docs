import React, {useState} from 'react';
import {Calculator, Field, Result, fmt, parse} from './parts';

/** Liquidation price, seizure, and the price where a loan turns into bad debt, for one collateral token. */
export default function LiquidationCalculator() {
  const [amount, setAmount] = useState('0.05');
  const [price, setPrice] = useState('2260');
  const [debt, setDebt] = useState('70');
  const [threshold, setThreshold] = useState('80');
  const [bonus, setBonus] = useState('5');

  const a = parse(amount);
  const px = parse(price);
  const d = parse(debt);
  const lt = parse(threshold) / 100;
  const b = parse(bonus) / 100;

  const liqPrice = d / (a * lt);
  const drop = (1 - liqPrice / px) * 100;
  const badDebtPrice = (d * (1 + b)) / a;
  const seized = (d * (1 + b)) / liqPrice;

  return (
    <Calculator
      title="Liquidation calculator"
      note="One collateral token, mid prices. A liquidator who repays the whole debt receives collateral worth the debt plus the bonus. Below the bad-debt price the whole collateral is worth less than that, so the liquidator repays only what it is worth and the rest is written off.">
      <div className="calc__grid">
        <Field label="Collateral" suffix="ETH" value={amount} onChange={setAmount} />
        <Field label="Price now" suffix="USD" value={price} onChange={setPrice} />
        <Field label="Debt face" suffix="USDC" value={debt} onChange={setDebt} />
        <Field label="Liquidation threshold" suffix="%" value={threshold} onChange={setThreshold} />
        <Field label="Liquidation bonus" suffix="%" value={bonus} onChange={setBonus} />
      </div>
      <div className="calc__results">
        <Result label="Liquidation price" value={`$${fmt(liqPrice)}`} />
        <Result
          label="Drop from the price now"
          value={drop > 0 ? `${fmt(drop)} %` : 'liquidatable now'}
          tone={drop > 0 ? 'good' : 'bad'}
        />
        <Result label="Seized at that price for the whole debt" value={`${fmt(seized, 6)} ETH`} />
        <Result label="Bad debt below" value={`$${fmt(badDebtPrice)}`} />
      </div>
    </Calculator>
  );
}
