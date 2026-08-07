import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import {
  signEnableBankingJwt,
  isEnableBankingConfigured,
  listAspsps,
  startAuth,
  exchangeCode,
  getTransactions,
} from "./enable-banking";

// Throwaway keypair generated for this test run only — never the real .pem.
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

function verifyJwt(jwt: string): { header: Record<string, unknown>; claims: Record<string, unknown> } {
  const [headerB64, claimsB64, sigB64] = jwt.split(".");
  const signingInput = `${headerB64}.${claimsB64}`;
  const ok = crypto.verify(
    "RSA-SHA256",
    Buffer.from(signingInput),
    publicKey,
    Buffer.from(sigB64, "base64url")
  );
  expect(ok).toBe(true);
  return {
    header: JSON.parse(Buffer.from(headerB64, "base64url").toString()),
    claims: JSON.parse(Buffer.from(claimsB64, "base64url").toString()),
  };
}

describe("signEnableBankingJwt", () => {
  it("signs a JWT that verifies against the test public key with the exact claims", () => {
    const now = Date.parse("2026-08-07T12:00:00Z");
    const jwt = signEnableBankingJwt("app-id-123", privateKey, now);
    const { header, claims } = verifyJwt(jwt);
    expect(header).toEqual({ typ: "JWT", alg: "RS256", kid: "app-id-123" });
    expect(claims.iss).toBe("enablebanking.com");
    expect(claims.aud).toBe("api.enablebanking.com");
    expect(claims.iat).toBe(Math.floor(now / 1000));
    expect(claims.exp).toBe(Math.floor(now / 1000) + 3600);
  });

  it("rejects a JWT signed with a different keypair", () => {
    const other = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const jwt = signEnableBankingJwt("app-id-123", other.privateKey);
    const [headerB64, claimsB64, sigB64] = jwt.split(".");
    const ok = crypto.verify(
      "RSA-SHA256",
      Buffer.from(`${headerB64}.${claimsB64}`),
      publicKey,
      Buffer.from(sigB64, "base64url")
    );
    expect(ok).toBe(false);
  });
});

describe("isEnableBankingConfigured", () => {
  const orig = { ...process.env };
  afterEach(() => {
    process.env = { ...orig };
  });

  it("is false with no creds, true once both are set", () => {
    delete process.env.ENABLE_BANKING_APP_ID;
    delete process.env.ENABLE_BANKING_PRIVATE_KEY;
    expect(isEnableBankingConfigured()).toBe(false);
    process.env.ENABLE_BANKING_APP_ID = "app-id";
    expect(isEnableBankingConfigured()).toBe(false);
    process.env.ENABLE_BANKING_PRIVATE_KEY = privateKey;
    expect(isEnableBankingConfigured()).toBe(true);
  });
});

describe("client calls (offline, injected transport)", () => {
  const orig = { ...process.env };

  beforeEach(() => {
    process.env.ENABLE_BANKING_APP_ID = "app-id-123";
    process.env.ENABLE_BANKING_PRIVATE_KEY = privateKey;
  });
  afterEach(() => {
    process.env = { ...orig };
  });

  it("returns null and never calls the transport when unconfigured", async () => {
    delete process.env.ENABLE_BANKING_APP_ID;
    const transport = vi.fn();
    const result = await listAspsps("FR", transport as unknown as typeof fetch);
    expect(result).toBeNull();
    expect(transport).not.toHaveBeenCalled();
  });

  it("listAspsps sends a signed Authorization header and parses the fixture", async () => {
    const transport = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://api.enablebanking.com/aspsps?country=FR");
      const auth = (init?.headers as Record<string, string>).Authorization;
      expect(auth).toMatch(/^Bearer /);
      const jwt = auth.replace("Bearer ", "");
      const { claims } = verifyJwt(jwt);
      expect(claims.iss).toBe("enablebanking.com");
      return new Response(
        JSON.stringify({ aspsps: [{ name: "REDACTED_BANK", country: "FR" }] }),
        { status: 200 }
      );
    });
    const result = await listAspsps("FR", transport as unknown as typeof fetch);
    expect(result).toEqual([{ name: "REDACTED_BANK", country: "FR" }]);
  });

  it("startAuth posts the consent params and returns the redirect url", async () => {
    const transport = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://api.enablebanking.com/auth");
      const body = JSON.parse(init!.body as string);
      expect(body).toMatchObject({
        aspsp: { name: "REDACTED_BANK", country: "FR" },
        state: "redacted-state",
        redirect_url: "https://redacted.example/callback",
        psu_type: "personal",
      });
      return new Response(JSON.stringify({ url: "https://redacted.example/consent" }), { status: 200 });
    });
    const result = await startAuth(
      {
        aspspName: "REDACTED_BANK",
        aspspCountry: "FR",
        redirectUrl: "https://redacted.example/callback",
        state: "redacted-state",
        validUntilIso: "2027-02-03T00:00:00Z",
      },
      transport as unknown as typeof fetch
    );
    expect(result).toBe("https://redacted.example/consent");
  });

  it("exchangeCode returns session id + accounts from the fixture", async () => {
    const transport = vi.fn(async () =>
      new Response(
        JSON.stringify({ session_id: "REDACTED_SESSION", accounts: ["REDACTED_ACCT_1", "REDACTED_ACCT_2"] }),
        { status: 200 }
      )
    );
    const result = await exchangeCode("redacted-code", transport as unknown as typeof fetch);
    expect(result).toEqual({ sessionId: "REDACTED_SESSION", accounts: ["REDACTED_ACCT_1", "REDACTED_ACCT_2"] });
  });

  it("getTransactions normalises the fixture shape and passes through continuation_key", async () => {
    const transport = vi.fn(async (url: string) => {
      expect(url).toBe("https://api.enablebanking.com/accounts/REDACTED_ACCT_1/transactions");
      return new Response(
        JSON.stringify({
          transactions: [
            {
              transaction_id: "REDACTED_TXN_1",
              booking_date: "2026-08-01",
              value_date: "2026-08-01",
              transaction_amount: { amount: "-9.99", currency: "EUR" },
              creditor: { name: "REDACTED_MERCHANT" },
              remittance_information: ["REDACTED SUBSCRIPTION"],
            },
          ],
          continuation_key: "REDACTED_PAGE_2",
        }),
        { status: 200 }
      );
    });
    const result = await getTransactions("REDACTED_ACCT_1", undefined, transport as unknown as typeof fetch);
    expect(result).toEqual({
      transactions: [
        {
          transactionId: "REDACTED_TXN_1",
          bookingDate: "2026-08-01",
          valueDate: "2026-08-01",
          amount: "-9.99",
          currency: "EUR",
          creditorName: "REDACTED_MERCHANT",
          debtorName: undefined,
          remittanceInformation: ["REDACTED SUBSCRIPTION"],
          raw: {
            transaction_id: "REDACTED_TXN_1",
            booking_date: "2026-08-01",
            value_date: "2026-08-01",
            transaction_amount: { amount: "-9.99", currency: "EUR" },
            creditor: { name: "REDACTED_MERCHANT" },
            remittance_information: ["REDACTED SUBSCRIPTION"],
          },
        },
      ],
      continuationKey: "REDACTED_PAGE_2",
    });
  });

  it("returns null on a non-ok response instead of throwing", async () => {
    const transport = vi.fn(async () => new Response("nope", { status: 401 }));
    const result = await listAspsps("FR", transport as unknown as typeof fetch);
    expect(result).toBeNull();
  });
});
