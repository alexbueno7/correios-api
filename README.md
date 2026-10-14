# correios-api-client

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white) ![Node 18+](https://img.shields.io/badge/Node-18%2B-339933?logo=nodedotjs&logoColor=white)

Typed TypeScript client for the official **Correios API** (`api.correios.com.br`) — the Brazilian postal service REST API available to contract holders through *Meu Correios*.

Covers token, price quote, delivery time, CEP lookup and parcel tracking, with automatic token caching and renewal. Zero runtime dependencies beyond Node's native `fetch`.

> **Status:** built in early 2024 against the then-current contract API. Endpoint shapes may have drifted; check the [official docs](https://api.correios.com.br) before relying on it in production. PRs welcome.

[Leia em português](README-PT.md)

---

## Why

Correios ships a REST API but no SDK. Integrating it by hand means dealing with three different auth flows (plain, by contract, by posting card), tokens that expire mid-session, numeric API IDs that must be present in the token, and a dozen enums for services and object types. This client hides all of that behind five small, typed façades.

## Supported APIs

| API | Correios ID | Client | Methods |
|---|---|---|---|
| Token | 5 | `apiClient.Token` | `autentica()`, `autenticaContrato()`, `autenticaCartaoPostagem()` |
| Preço | 34 | `apiClient.Preco` | `nacional(consulta)` |
| Prazo | 35 | `apiClient.Prazo` | `nacional(servico, cepOrigem, cepDestino, dataEvento?)` |
| CEP | 41 | `apiClient.Cep` | `search(cep)`, `searchMany(ceps[])` |
| Rastro | 87 | `apiClient.Rastro` | `search(codigo, tipo?)`, `searchMany(codigos[], tipo?)` |

The Correios ID is what shows up in `Token.api[]`; the client logs an error if you call an API your token was not issued for.

## Install

```bash
npm install correios-api-client
```

Requires Node 18+ (native `fetch`).

## Quick start

```ts
import apiClient, { Ambientes, TiposObjeto, ServicosCorreios } from "correios-api-client";

apiClient.initialize({
  ambiente: Ambientes.Homologacao,          // or Ambientes.Producao
  idCorreios: process.env.CORREIOS_ID!,     // Meu Correios user (CNPJ)
  codigoAcesso: process.env.CORREIOS_CODIGO_ACESSO!,
  contrato: process.env.CORREIOS_CONTRATO!,
  cartaoPostagem: process.env.CORREIOS_CARTAO_POSTAGEM, // optional
});

const preco = await apiClient.Preco.nacional({
  codigoProduto: ServicosCorreios.PAC,      // "04510"
  cepOrigem: "85070222",
  cepDestino: "01310100",
  pesoEmGramas: 300,
  tipoObjeto: TiposObjeto.Pacote,
  larguraCm: 20, alturaCm: 20, comprimentoCm: 20,
  valorDeclarado: 200,
  isAvisoRecebimento: false,
  isMaoPropria: false,
});

const prazo = await apiClient.Prazo.nacional(ServicosCorreios.PAC, "85070222", "01310100");
const endereco = await apiClient.Cep.search("01310100");
const rastro = await apiClient.Rastro.search("LX697446262CN");
```

Never hardcode credentials. Copy `.env.example` to `.env` and load it with `dotenv` (see `src/app.ts`).

## How it works

### Authentication

Correios issues JWTs via `POST /token/v1/autentica[/contrato|/cartaopostagem]` using HTTP Basic (`idCorreios:codigoAcesso`). Which variant you need depends on the API:

- **Preço / Prazo** require a token bound to a **contract** or **posting card**.
- **CEP / Rastro** work with the plain token.

Each `*ApiClient` extends `BaseApiClient`, which:

1. Keeps the last token in a process-wide singleton (`config.lastToken`).
2. Before every request, renews the token if it is absent, expired (`expiraEm`) or was not issued for the current API (`api[]`). Renewal uses `autenticaCartaoPostagem` when a posting card is configured, otherwise `autenticaContrato`.
3. Sends the request with `Authorization: Bearer <token>`.

You can also call `apiClient.Token.autentica*()` yourself to inspect the token (`ambiente`, `api[]`, `expiraEm`, `cartaoPostagem`, `contrato`).

### Environments

| `Ambientes` | Base URL |
|---|---|
| `Producao` | `https://api.correios.com.br` |
| `Homologacao` | `https://apihom.correios.com.br` |

### Error handling

No exceptions for API-level failures. Every call resolves to either the typed payload **or** a `MessageResponse`, mirroring the Correios error envelope:

```ts
class MessageResponse {
  causa: string;   // e.g. "Unauthorized"
  msgs: string[];  // human-readable messages from Correios
  path: string;
  method: string;
  date: string;
  stackTrace: string;
}
```

Discriminate with `instanceof`:

```ts
const result = await apiClient.Cep.search("00000000");
if (result instanceof MessageResponse) {
  console.error(result.msgs);
} else {
  console.log(result.logradouro, result.localidade, result.uf);
}
```

Network/parse errors are caught and wrapped in a `MessageResponse` with `causa: "Catch error"`, so the return type is stable.

### Price quote details

`Preco.nacional()` maps the `ConsultaPreco` object to the query string Correios expects and handles the quirks for you:

- `TiposObjeto.RoloOuPrima` sends `diametroCm`, others don't.
- `isAvisoRecebimento`, `isMaoPropria` and `valorDeclarado > 0` are turned into the corresponding `servicosAdicionais` codes.
- Weight is in grams; dimensions in centimeters.

### Enums

`ServicosCorreios` lists ~70 product codes (PAC `04510`, SEDEX variants, Carta, Coleta, Reversa…). `TiposObjeto` is `Envelope | Pacote | RoloOuPrima`. `RastroTiposResultado` controls how much tracking history you get back. All exported from the package root.

## Project layout

```
src/
├── client.ts          # ApiClient singleton exposing Token/Cep/Prazo/Preco/Rastro
├── config.ts          # credentials, environment, last-token cache
├── apis/
│   ├── base.ts        # auth flows, token validation, GET/POST, error normalization
│   ├── token.ts
│   ├── cep.ts
│   ├── prazo.ts
│   ├── preco.ts
│   └── rastro.ts
├── schemas/           # request/response types and enums (1:1 with Correios payloads)
├── util/
│   ├── http-client.ts # thin fetch wrapper
│   ├── date.ts
│   └── text.ts
└── app.ts             # example Express server: POST /calc → PAC + SEDEX quote
```

## Example server

`src/app.ts` is a reference integration: an Express endpoint that receives package dimensions and returns PAC and SEDEX prices with delivery time. Run it with:

```bash
cp .env.example .env   # fill in your Meu Correios credentials
pnpm install
pnpm start:dev         # nodemon on :3333
```

```bash
curl -X POST localhost:3333/calc -H 'content-type: application/json' -d '{
  "cepOrigem":"85070222","cepDestino":"01310100",
  "alturaCm":20,"larguraCm":20,"comprimentoCm":20,"diametroCm":0,
  "pesoEmGramas":300,"codigoProduto":"04510","valorDeclarado":200
}'
```

## Build

```bash
pnpm build   # tsup → dist/
```

## Getting credentials

1. Create an account at [Meu Correios](https://meucorreios.correios.com.br) linked to your company's contract.
2. Go to *Gestão de Acesso a APIs* and generate a `codigoAcesso`.
3. Enable the APIs you need (5, 34, 35, 41, 87) for your contract/posting card.

## License

MIT
