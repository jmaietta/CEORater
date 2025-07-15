// utils.js

export const pct = v => typeof v === 'number' ? (v * 100).toLocaleString('en-US', { maximumFractionDigits: 0 }) + '%' : 'N/A';

export const money = (v, d = 2) => typeof v === 'number' ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : 'N/A';

export const formatMarketCap = v => {
    if (typeof v !== 'number' || v === 0) return 'N/A';
    if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
    if (v >= 1e9) return `$${(v / 1e9).toFixed(0)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
    return `$${v.toLocaleString()}`;
};
