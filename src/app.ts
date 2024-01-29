import apiClient from "./client";
import { 
     ConsultaPreco,  
     MessageResponse, 
     Configuration, 
     Ambientes 
} from "./schemas/";
import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";

interface IPackage {
  cepOrigem: string;
  cepDestino: string;
  alturaCm: number;
  comprimentoCm: number;
  diametroCm: number;
  larguraCm: number;
  pesoEmGramas: number;
  codigoProduto: string;
  valorDeclarado: number;
}

dotenv.config();

const app: Express = express();
app.use(express.json())
const port = process.env.PORT || 3000;

const configuration: Configuration = {
    ambiente:  Ambientes.Producao,
    idCorreios: "00000000000000",
    codigoAcesso:  "***REMOVED***",
    contrato:  "0000000000",
    cartaoPostagem: "0000000000"
  }

  app.get("/calc", async (req: Request, res: Response) => {
    const product: IPackage = req.body;
    try {
        apiClient.initialize(configuration);
       
        const consultaPac: ConsultaPreco = {
            cepOrigem: product.cepOrigem,
            cepDestino: product.cepDestino,
            alturaCm: product.alturaCm,
            comprimentoCm: product.comprimentoCm,
            diametroCm: product.diametroCm,
            larguraCm: product.larguraCm,
            pesoEmGramas: product.pesoEmGramas,
            codigoProduto: "04669",
            valorDeclarado: 0,
            tipoObjeto: 1,
            isAvisoRecebimento: false,
            isMaoPropria: false   
        };

        const consultaSedex: ConsultaPreco = {
          cepOrigem: product.cepOrigem,
          cepDestino: product.cepDestino,
          alturaCm: product.alturaCm,
          comprimentoCm: product.comprimentoCm,
          diametroCm: product.diametroCm,
          larguraCm: product.larguraCm,
          pesoEmGramas: product.pesoEmGramas,
          codigoProduto: "03220",
          valorDeclarado: product.valorDeclarado,
          tipoObjeto: 1,
          isAvisoRecebimento: false,
          isMaoPropria: false   
      };

        const prazoPac = await apiClient.Prazo.nacional("04669", product.cepOrigem, product.cepDestino);
        const precoPac = await apiClient.Preco.nacional(consultaPac);

        const prazoSedex = await apiClient.Prazo.nacional("03220", product.cepOrigem, product.cepDestino);
        const precoSedex = await apiClient.Preco.nacional(consultaSedex);
        
        
        const cotation = {
            prazoPac: prazoPac,
            precoPac: precoPac,
            prazoSedex: prazoSedex,
            precoSedex: precoSedex
        };

        return res.json(cotation);
    } catch (error) {
      // Handle the error, potentially log it or send a custom error message
      console.error("Error in handling request:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  app.get("/", async (req: Request, res: Response) => {
      res.send("Online");
    }
  );
  
  function maybeLog(value: unknown) {
  
    if (value instanceof MessageResponse) {
        console.error(`[server]: ${value.msgs.join("\n")}`);
    }
  }
  
  app.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
  });