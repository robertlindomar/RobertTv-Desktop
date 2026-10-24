**RobertTV Desktop v0.2.0-beta.1 — controle pelo celular no Wi-Fi**

- Pareamento por QR Code e código temporário, com confirmação no computador.
- Atalhos para os sete serviços, início, voltar, tela cheia, setas e OK.
- Touchpad com cursor visível inclusive sobre modais; toque para clicar e faixa lateral de rolagem com um dedo.
- Teclado do celular, play/pause, volume, silenciar e avanço/retorno de dez segundos. Os comandos de mídia dependem do player; o touchpad permite usar seus próprios botões.
- Opção **Adicionar à tela inicial**, com ícone RobertTV e guia para iPhone/Android. No HTTP local, a opção manual do navegador é usada quando não há instalação automática disponível.
- Pareamento restrito à rede local, um controle por vez, código com validade de cinco minutos e sessão de até oito horas. Pode ser revogado nas configurações.

**Linux x64:** extraia o `.tar.gz`, abra `RobertTV` e use `instalar-icone.sh` para adicionar ao menu.

**Windows x64 — experimental:** extraia todo o ZIP e abra `RobertTV.exe`. Inicialização e interface verificadas em Windows. Reprodução protegida ainda não foi validada, e não há assinatura VMP de produção nem assinatura Authenticode.

**Controle Wi-Fi:** ative em Configurações → Controle pelo celular; os dispositivos devem estar na mesma rede. Se o firewall bloquear, libere apenas a porta indicada na interface de rede privada. O aplicativo não abre portas no roteador nem altera o firewall. A comunicação HTTP não é criptografada: use somente redes locais de confiança.

**Privacidade e atualização:** os pacotes não contêm logins, cookies ou perfis do autor. A versão distribuída mantém os dados na pasta do usuário, fora do programa; não apague essa pasta ao atualizar. Cada pessoa precisa das próprias contas/assinaturas. O primeiro acesso pelo atalho do celular pode pedir novo pareamento.
