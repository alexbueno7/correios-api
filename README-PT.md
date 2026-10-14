# correios-api-client

Cliente TypeScript tipado para a **API oficial dos Correios** (`api.correios.com.br`) — a API REST disponível para detentores de contrato via *Meu Correios*.

Cobre token, cálculo de preço, prazo de entrega, consulta de CEP e rastreamento de objetos, com cache e renovação automática de token. Sem dependências em runtime além do `fetch` nativo do Node.

> **Status:** construído no início de 2024 contra a API de contrato vigente na época. O formato dos endpoints pode ter mudado; confira a [documentação oficial](https://api.correios.com.br) antes de usar em produção. PRs são bem-vindos.

[Read in English](README.md)

---

## Por quê

Os Correios disponibilizam uma API REST, mas nenhum SDK. Integrar na mão significa lidar com três fluxos de autenticação diferentes (simples, por contrato, por cartão de postagem), tokens que expiram no meio da sessão, IDs numéricos de API que precisam constar no token e uma dúzia de enums de serviços e tipos de objeto. Este cliente esconde tudo isso atrás de cinco fachadas pequenas e tipadas.

## APIs suportadas

| API | ID Correios | Client | Métodos |
|---|---|---|---|
| Token | 5 | `apiClient.Token` | `autentica()`, `autenticaContrato()`, `autenticaCartaoPostagem()` |
| Preço | 34 | `apiClient.Preco` | `nacional(consulta)` |
| Prazo | 35 | `apiClient.Prazo` | `nacional(servico, cepOrigem, cepDestino, dataEvento?)` |
| CEP | 41 | `apiClient.Cep` | `search(cep)`, `searchMany(ceps[])` |
| Rastro | 87 | `apiClient.Rastro` | `search(codigo, tipo?)`, `searchMany(codigos[], tipo?)` |

O ID Correios é o que aparece em `Token.api[]`; o cliente registra um erro se você chamar uma API para a qual o token não foi emitido.

## Instalação

```bash
npm install correios-api-client
```

Requer Node 18+ (`fetch` nativo).

## Início rápido

```ts
import apiClient, { Ambientes, TiposObjeto, ServicosCorreios } from "correios-api-client";

apiClient.initialize({
  ambiente: Ambientes.Homologacao,          // ou Ambientes.Producao
  idCorreios: process.env.CORREIOS_ID!,     // usuário Meu Correios (CNPJ)
  codigoAcesso: process.env.CORREIOS_CODIGO_ACESSO!,
  contrato: process.env.CORREIOS_CONTRATO!,
  cartaoPostagem: process.env.CORREIOS_CARTAO_POSTAGEM, // opcional
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

Nunca coloque credenciais no código. Copie `.env.example` para `.env` e carregue com `dotenv` (veja `src/app.ts`).

## Como funciona

### Autenticação

Os Correios emitem JWTs via `POST /token/v1/autentica[/contrato|/cartaopostagem]` usando HTTP Basic (`idCorreios:codigoAcesso`). Qual variante você precisa depende da API:

- **Preço / Prazo** exigem token vinculado a um **contrato** ou **cartão de postagem**.
- **CEP / Rastro** funcionam com o token simples.

Cada `*ApiClient` estende `BaseApiClient`, que:

1. Mantém o último token em um singleton do processo (`config.lastToken`).
2. Antes de cada requisição, renova o token se ele estiver ausente, expirado (`expiraEm`) ou não tiver sido emitido para a API atual (`api[]`). A renovação usa `autenticaCartaoPostagem` quando há cartão de postagem configurado, senão `autenticaContrato`.
3. Envia a requisição com `Authorization: Bearer <token>`.

Você também pode chamar `apiClient.Token.autentica*()` diretamente para inspecionar o token (`ambiente`, `api[]`, `expiraEm`, `cartaoPostagem`, `contrato`).

### Ambientes

| `Ambientes` | URL base |
|---|---|
| `Producao` | `https://api.correios.com.br` |
| `Homologacao` | `https://apihom.correios.com.br` |

### Tratamento de erros

Sem exceções para falhas de API. Toda chamada resolve para o payload tipado **ou** um `MessageResponse`, espelhando o envelope de erro dos Correios:

```ts
class MessageResponse {
  causa: string;   // ex.: "Unauthorized"
  msgs: string[];  // mensagens legíveis vindas dos Correios
  path: string;
  method: string;
  date: string;
  stackTrace: string;
}
```

Discrimine com `instanceof`:

```ts
const result = await apiClient.Cep.search("00000000");
if (result instanceof MessageResponse) {
  console.error(result.msgs);
} else {
  console.log(result.logradouro, result.localidade, result.uf);
}
```

Erros de rede/parse são capturados e embrulhados em um `MessageResponse` com `causa: "Catch error"`, então o tipo de retorno é estável.

### Detalhes do cálculo de preço

`Preco.nacional()` mapeia o objeto `ConsultaPreco` para a query string que os Correios esperam e cuida das particularidades:

- `TiposObjeto.RoloOuPrima` envia `diametroCm`, os demais não.
- `isAvisoRecebimento`, `isMaoPropria` e `valorDeclarado > 0` viram os respectivos códigos de `servicosAdicionais`.
- Peso em gramas; dimensões em centímetros.

### Enums

`ServicosCorreios` lista ~70 códigos de produto (PAC `04510`, variantes de SEDEX, Carta, Coleta, Reversa…). `TiposObjeto` é `Envelope | Pacote | RoloOuPrima`. `RastroTiposResultado` controla quanto histórico de rastreamento vem na resposta. Tudo exportado da raiz do pacote.

## Estrutura do projeto

```
src/
├── client.ts          # singleton ApiClient expondo Token/Cep/Prazo/Preco/Rastro
├── config.ts          # credenciais, ambiente, cache do último token
├── apis/
│   ├── base.ts        # fluxos de auth, validação de token, GET/POST, normalização de erro
│   ├── token.ts
│   ├── cep.ts
│   ├── prazo.ts
│   ├── preco.ts
│   └── rastro.ts
├── schemas/           # tipos de request/response e enums (1:1 com os payloads dos Correios)
├── util/
│   ├── http-client.ts # wrapper fino sobre fetch
│   ├── date.ts
│   └── text.ts
└── app.ts             # servidor Express de exemplo: POST /calc → cotação PAC + SEDEX
```

## Servidor de exemplo

`src/app.ts` é uma integração de referência: um endpoint Express que recebe as dimensões do pacote e devolve preço de PAC e SEDEX com prazo. Para rodar:

```bash
cp .env.example .env   # preencha com suas credenciais do Meu Correios
pnpm install
pnpm start:dev         # nodemon na :3333
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

## Obtendo credenciais

1. Crie uma conta no [Meu Correios](https://meucorreios.correios.com.br) vinculada ao contrato da sua empresa.
2. Acesse *Gestão de Acesso a APIs* e gere um `codigoAcesso`.
3. Habilite as APIs necessárias (5, 34, 35, 41, 87) para seu contrato/cartão de postagem.

## Licença

MIT
