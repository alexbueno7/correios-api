import { builtinModules } from "module";
import { defineConfig } from "vitest/config";
import pluginChecker from 'vite-plugin-checker';

const config: any = {
    lib: {
        entry: [
            "src/client.ts"
        ],
        fileName: "index",
        name: "correios-api-client",
    },
    example: {
        entry:[
            "src/app.ts"
        ],
        fileName: "app",
        name: "correios-api-client-app",
    },
};

const currentConfig = process.env.LIB_NAME != null
    ? config[process.env.LIB_NAME]
    : config.lib;


export default defineConfig({
    build: {
        target: "es2022",
        lib: {
            ...currentConfig,
        },
        commonjsOptions: {
            ignore: [...builtinModules],
        },
        sourcemap: true,
        outDir: "dist",
        emptyOutDir: false,
        minify: false,
    },
    resolve: {
        alias: {}
    },
    plugins: [pluginChecker({ typescript: true })]
});

namespace NodeJS {
    export interface ProcessEnv {
        LIB_NAME?: string;
    }
}

