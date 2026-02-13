import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                bobinas_protect: resolve(__dirname, 'bobinas-protect.html'),
                bowie_dick_folhas: resolve(__dirname, 'bowie-dick-folhas.html'),
                bowie_dick_pacote_pronto: resolve(__dirname, 'bowie-dick-pacote-pronto.html'),
                centro_cirurgico: resolve(__dirname, 'centro-cirurgico.html'),
                contato: resolve(__dirname, 'contato.html'),
                embalagem_tyvek: resolve(__dirname, 'embalagem-tyvek.html'),
                embalagens: resolve(__dirname, 'embalagens.html'),
                equipamentos: resolve(__dirname, 'equipamentos.html'),
                fita_autoclave: resolve(__dirname, 'fita-autoclave.html'),
                focos_cirurgicos: resolve(__dirname, 'focos-cirurgicos.html'),
                indicador_biologico_vh2o2_24h: resolve(__dirname, 'indicador-biologico-vh2o2-24h.html'),
                indicador_biologico: resolve(__dirname, 'indicador-biologico.html'),
                indicadores: resolve(__dirname, 'indicadores.html'),
                integrador_quimico_tipo5_tiras: resolve(__dirname, 'integrador-quimico-tipo5-tiras.html'),
                integrador_quimico_tipo5: resolve(__dirname, 'integrador-quimico-tipo5.html'),
                kits_cirurgicos: resolve(__dirname, 'kits-cirurgicos.html'),
                papel_crepado: resolve(__dirname, 'papel-crepado.html'),
                papel_grau_cirurgico: resolve(__dirname, 'papel-grau-cirurgico.html'),
                politica_privacidade: resolve(__dirname, 'politica-privacidade.html'),
                produtos: resolve(__dirname, 'produtos.html'),
                seladora_printer_pro: resolve(__dirname, 'seladora-printer-pro.html'),
                seladora_srn_01: resolve(__dirname, 'seladora-srn-01.html'),
                sistema_pistolas_pressurizadas: resolve(__dirname, 'sistema-pistolas-pressurizadas.html'),
                sms_wraps: resolve(__dirname, 'sms-wraps.html'),
                sobre: resolve(__dirname, 'sobre.html'),
                solucoes: resolve(__dirname, 'solucoes.html'),
                suporte_cortador_scd600: resolve(__dirname, 'suporte-cortador-scd600.html'),
                termodesinfectoras: resolve(__dirname, 'termodesinfectoras.html'),
                termos_uso: resolve(__dirname, 'termos-uso.html'),
            },
        },
    },
});
