# Minha Colheita Café - App Nativo

## 📱 Como Testar no Celular

### Pré-requisitos
- Node.js instalado
- Git instalado
- **Android**: Android Studio instalado
- **iOS**: Xcode instalado (apenas no Mac)

### Passo 1: Clonar o Projeto
```bash
# Exporte para o seu GitHub via botão "Export to Github"
# Depois clone o repositório
git clone <URL_DO_SEU_REPO>
cd <NOME_DO_PROJETO>
```

### Passo 2: Instalar Dependências
```bash
npm install
```

### Passo 3: Adicionar Plataformas
```bash
# Para Android
npx cap add android

# Para iOS (apenas no Mac)
npx cap add ios
```

### Passo 4: Atualizar Dependências Nativas
```bash
# Para Android
npx cap update android

# Para iOS
npx cap update ios
```

### Passo 5: Build do Projeto
```bash
npm run build
```

### Passo 6: Sincronizar com Capacitor
```bash
npx cap sync
```

### Passo 7: Rodar no Dispositivo

#### Android
```bash
npx cap run android
```
Isso abrirá o Android Studio. Conecte seu celular via USB (com depuração USB ativada) ou use um emulador.

#### iOS (Mac apenas)
```bash
npx cap run ios
```
Isso abrirá o Xcode. Conecte seu iPhone via USB ou use um simulador.

---

## 🔄 Workflow de Desenvolvimento

Sempre que você fizer mudanças no código:

1. **Git pull** para pegar as últimas mudanças:
   ```bash
   git pull
   ```

2. **Sincronizar** com Capacitor:
   ```bash
   npx cap sync
   ```

3. **Rodar** novamente:
   ```bash
   npx cap run android  # ou ios
   ```

---

## ⚡ Hot Reload

O app está configurado para usar **hot reload** direto do sandbox do Lovable. Isso significa que:

- Você pode editar o código no Lovable
- As mudanças aparecem instantaneamente no app móvel
- Não precisa rebuildar ou reinstalar

**Nota**: Para usar em produção, remova a configuração `server.url` do arquivo `capacitor.config.ts` e rode `npm run build` + `npx cap sync`.

---

## 📦 Funcionalidades Implementadas

✅ **Sistema de Login/Cadastro**
- Autenticação por usuário e senha
- Perfis de usuário

✅ **Dashboard**
- Total de café colhido
- Valor total arrecadado
- Número de panhadores ativos
- Últimas colheitas registradas

✅ **Lançamento de Colheita**
- Registro de peso e panhador
- Cálculo automático de valor
- Funciona offline

✅ **Cadastro de Panhadores**
- Nome do panhador
- Preço por kg individual
- Gerenciamento de panhadores ativos

✅ **Sincronização Offline**
- Salva dados localmente quando sem internet
- Sincroniza automaticamente quando conectar
- Indicador de status de conexão

---

## 🖨️ Próximas Funcionalidades

🔜 **Impressão Bluetooth**
- Integração com impressoras ESC/POS
- Recibos de colheita
- Relatórios

🔜 **Relatórios Avançados**
- Gráficos de produção
- Exportar para Excel/PDF
- Histórico detalhado

---

## 🎨 Design

O app usa um tema inspirado em café:
- **Marrom café** (#5D4037) - Cor principal
- **Verde plantação** - Cor secundária
- **Dourado** - Destaques
- Interface moderna e limpa
- Otimizado para uso em campo

---

## 🔒 Segurança

- Autenticação via Lovable Cloud (Supabase)
- Row Level Security (RLS) ativado
- Dados criptografados
- Cada usuário vê apenas seus dados

---

## 📚 Tecnologias

- **Frontend**: React + TypeScript + Vite
- **Mobile**: Capacitor
- **Backend**: Lovable Cloud (Supabase)
- **Banco de Dados**: PostgreSQL
- **Estilização**: Tailwind CSS + shadcn/ui
- **Offline**: LocalStorage + Sincronização

---

## 🆘 Problemas Comuns

### App não conecta ao backend
- Verifique se está conectado à internet
- Rode `npx cap sync` novamente

### Erro ao buildar
- Delete as pastas `android/` e `ios/`
- Rode `npx cap add android` (ou ios) novamente
- Rode `npm run build` e `npx cap sync`

### Mudanças não aparecem
- Faça `git pull`
- Rode `npx cap sync`
- Reinicie o app

---

## 📞 Suporte

Para dúvidas ou problemas, consulte:
- [Documentação do Capacitor](https://capacitorjs.com/docs)
- [Documentação do Lovable](https://docs.lovable.dev)

---

**Desenvolvido com ❤️ usando Lovable**
