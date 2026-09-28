import { sepaText } from "./validate";

/**
 * ISO 20022 customer credit transfer initiation (pain.001.001.03) — the bulk payment file UK
 * and European banks accept for SEPA euro transfers and international payments. One payment
 * block per currency; euro payments are marked SEPA with shared-level charges (SLEV), others
 * share charges (SHAR).
 */

export type Pain001Payment = {
  endToEndId: string;
  /** Minor units (cents, pence). */
  amountMinor: number;
  currency: string;
  creditorName: string;
  creditorIban: string;
  creditorBic: string | null;
  remittance: string;
};

export type Pain001Input = {
  messageId: string;
  createdAt: string; // ISO date-time
  executionDate: string; // YYYY-MM-DD
  debtor: { name: string; iban: string; bic: string };
  payments: Pain001Payment[];
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (minor: number) => (minor / 100).toFixed(2);
const id35 = (s: string) => sepaText(s, 35).replace(/ /g, "-") || "X";

export function buildPain001(input: Pain001Input): string {
  if (!input.payments.length) throw new Error("No payments");
  const byCurrency = new Map<string, Pain001Payment[]>();
  for (const p of input.payments) byCurrency.set(p.currency, [...(byCurrency.get(p.currency) ?? []), p]);
  const sum = (ps: Pain001Payment[]) => money(ps.reduce((s, p) => s + p.amountMinor, 0));

  const blocks = [...byCurrency.entries()].map(([currency, ps], n) => {
    const sepa = currency === "EUR";
    const txs = ps
      .map(
        (p) => `      <CdtTrfTxInf>
        <PmtId><EndToEndId>${esc(id35(p.endToEndId))}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="${currency}">${money(p.amountMinor)}</InstdAmt></Amt>${
          p.creditorBic ? `\n        <CdtrAgt><FinInstnId><BIC>${esc(p.creditorBic)}</BIC></FinInstnId></CdtrAgt>` : ""
        }
        <Cdtr><Nm>${esc(sepaText(p.creditorName, 70))}</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>${esc(p.creditorIban)}</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>${esc(sepaText(p.remittance, 140))}</Ustrd></RmtInf>
      </CdtTrfTxInf>`
      )
      .join("\n");
    return `    <PmtInf>
      <PmtInfId>${esc(id35(`${input.messageId}-${n + 1}`))}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${ps.length}</NbOfTxs>
      <CtrlSum>${sum(ps)}</CtrlSum>${sepa ? "\n      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>" : ""}
      <ReqdExctnDt>${input.executionDate}</ReqdExctnDt>
      <Dbtr><Nm>${esc(sepaText(input.debtor.name, 70))}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${esc(input.debtor.iban)}</IBAN></Id></DbtrAcct>
      <DbtrAgt><FinInstnId><BIC>${esc(input.debtor.bic)}</BIC></FinInstnId></DbtrAgt>
      <ChrgBr>${sepa ? "SLEV" : "SHAR"}</ChrgBr>
${txs}
    </PmtInf>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${esc(id35(input.messageId))}</MsgId>
      <CreDtTm>${input.createdAt.slice(0, 19)}</CreDtTm>
      <NbOfTxs>${input.payments.length}</NbOfTxs>
      <CtrlSum>${sum(input.payments)}</CtrlSum>
      <InitgPty><Nm>${esc(sepaText(input.debtor.name, 70))}</Nm></InitgPty>
    </GrpHdr>
${blocks.join("\n")}
  </CstmrCdtTrfInitn>
</Document>
`;
}
