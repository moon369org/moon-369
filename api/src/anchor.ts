/**
 * Anchor a tide on the XRP Ledger: an AccountSet transaction from Moon's own account whose memo
 * carries the tide's lune and hash. Once the ledger closes, no one (Moon included) can change
 * which tides existed by then. Costs a few drops (millionths of an XRP) per lune.
 *
 * XRPL_SEED: the wallet's family seed (keep secret). XRPL_SERVER: optional WebSocket URL.
 */
import type { Anchor, Tide } from './tideline.js';
import { TIDELINE } from './tideline.js';

const hex = (s: string) => Buffer.from(s, 'utf8').toString('hex').toUpperCase();

export function xrplAnchorer(seed: string, server = 'wss://xrplcluster.com') {
  return async (tide: Tide): Promise<Anchor | null> => {
    const xrpl = await import('xrpl');
    const client = new xrpl.Client(server, { connectionTimeout: 8000 });
    await client.connect();
    try {
      const wallet = xrpl.Wallet.fromSeed(seed);
      const tx = await client.autofill({
        TransactionType: 'AccountSet',
        Account: wallet.address,
        Memos: [{ Memo: { MemoType: hex(TIDELINE), MemoFormat: hex('text/plain'), MemoData: hex(`${tide.lune} ${tide.hash}`) } }],
      });
      const res = await client.submitAndWait(wallet.sign(tx).tx_blob);
      const meta = res.result.meta as { TransactionResult?: string } | undefined;
      if (meta?.TransactionResult !== 'tesSUCCESS') return null;
      return { network: 'xrpl', tx: res.result.hash, ledger_index: res.result.ledger_index, explorer: `https://livenet.xrpl.org/transactions/${res.result.hash}` };
    } finally { await client.disconnect(); }
  };
}
