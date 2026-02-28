# 🖨️ Guia: Implementar Impressão Bluetooth

Este guia explica como adicionar impressão via Bluetooth para impressoras ESC/POS no app "Minha Colheita Café".

## 📦 Bibliotecas Necessárias

Para implementar impressão Bluetooth, você precisará instalar:

```bash
# Plugin Capacitor para Bluetooth
npm install @capacitor-community/bluetooth-le

# Biblioteca para comandos ESC/POS
npm install escpos escpos-buffer
```

## 🔧 Configuração do Capacitor

### Android - `android/app/src/main/AndroidManifest.xml`
Adicione as permissões Bluetooth:

```xml
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
```

### iOS - `ios/App/App/Info.plist`
Adicione as descrições de uso:

```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>Precisamos de Bluetooth para conectar à impressora</string>
<key>NSBluetoothPeripheralUsageDescription</key>
<string>Conectar à impressora via Bluetooth</string>
```

## 💻 Código de Exemplo

### Hook: `src/hooks/useBluetoothPrinter.ts`

```typescript
import { useState } from "react";
import { BleClient, BleDevice } from "@capacitor-community/bluetooth-le";

export const useBluetoothPrinter = () => {
  const [devices, setDevices] = useState<BleDevice[]>([]);
  const [connected, setConnected] = useState(false);
  const [currentDevice, setCurrentDevice] = useState<BleDevice | null>(null);

  // Inicializar Bluetooth
  const initBluetooth = async () => {
    try {
      await BleClient.initialize();
      return true;
    } catch (error) {
      console.error("Erro ao inicializar Bluetooth:", error);
      return false;
    }
  };

  // Escanear dispositivos
  const scanDevices = async () => {
    const foundDevices: BleDevice[] = [];
    
    try {
      await BleClient.requestLEScan({}, (result) => {
        if (result.device.name?.toLowerCase().includes("printer")) {
          foundDevices.push(result.device);
        }
      });

      setTimeout(() => {
        BleClient.stopLEScan();
        setDevices(foundDevices);
      }, 5000);
    } catch (error) {
      console.error("Erro ao escanear:", error);
    }
  };

  // Conectar à impressora
  const connectToPrinter = async (device: BleDevice) => {
    try {
      await BleClient.connect(device.deviceId);
      setConnected(true);
      setCurrentDevice(device);
      return true;
    } catch (error) {
      console.error("Erro ao conectar:", error);
      return false;
    }
  };

  // Desconectar
  const disconnect = async () => {
    if (!currentDevice) return;
    
    try {
      await BleClient.disconnect(currentDevice.deviceId);
      setConnected(false);
      setCurrentDevice(null);
    } catch (error) {
      console.error("Erro ao desconectar:", error);
    }
  };

  // Imprimir recibo
  const printReceipt = async (data: {
    panhador: string;
    peso: number;
    preco: number;
    total: number;
    data: string;
  }) => {
    if (!currentDevice) {
      throw new Error("Nenhuma impressora conectada");
    }

    // Comandos ESC/POS básicos
    const ESC = "\x1B";
    const INIT = ESC + "@";
    const CENTER = ESC + "a1";
    const LEFT = ESC + "a0";
    const BOLD_ON = ESC + "E1";
    const BOLD_OFF = ESC + "E0";
    const CUT = ESC + "i";
    const LINE = "--------------------------------\n";

    const receipt = 
      INIT +
      CENTER +
      BOLD_ON + "MINHA COLHEITA CAFÉ\n" + BOLD_OFF +
      LINE +
      LEFT +
      `Panhador: ${data.panhador}\n` +
      `Peso: ${data.peso.toFixed(2)} kg\n` +
      `Preço/kg: R$ ${data.preco.toFixed(2)}\n` +
      LINE +
      BOLD_ON + `TOTAL: R$ ${data.total.toFixed(2)}\n` + BOLD_OFF +
      LINE +
      CENTER +
      `Data: ${data.data}\n` +
      "\n\n\n" +
      CUT;

    try {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(receipt);
      
      // Enviar para a impressora
      // Nota: você precisará descobrir o UUID correto do serviço
      // e característica da sua impressora específica
      const SERVICE_UUID = "00001101-0000-1000-8000-00805f9b34fb";
      const CHAR_UUID = "00001101-0000-1000-8000-00805f9b34fb";
      
      await BleClient.write(
        currentDevice.deviceId,
        SERVICE_UUID,
        CHAR_UUID,
        new DataView(bytes.buffer)
      );
      
      return true;
    } catch (error) {
      console.error("Erro ao imprimir:", error);
      return false;
    }
  };

  return {
    devices,
    connected,
    currentDevice,
    initBluetooth,
    scanDevices,
    connectToPrinter,
    disconnect,
    printReceipt,
  };
};
```

## 🎯 Integração na Tela de Lançamento

Atualize `src/pages/Lancamento.tsx`:

```typescript
import { useBluetoothPrinter } from "@/hooks/useBluetoothPrinter";

export default function Lancamento() {
  const { 
    connected, 
    printReceipt,
    initBluetooth,
    scanDevices,
    connectToPrinter,
    devices 
  } = useBluetoothPrinter();

  // Ao clicar no botão de impressora
  const handlePrint = async () => {
    if (!connected) {
      // Mostrar dialog para conectar
      await initBluetooth();
      await scanDevices();
      // Mostrar lista de dispositivos para usuário escolher
    } else {
      // Imprimir
      const panhador = panhadores.find(p => p.id === panhadorId);
      if (!panhador) return;

      const success = await printReceipt({
        panhador: panhador.nome,
        peso: Number(pesoKg),
        preco: panhador.preco_por_kg,
        total: Number(pesoKg) * panhador.preco_por_kg,
        data: new Date().toLocaleString("pt-BR"),
      });

      if (success) {
        toast({
          title: "Impresso com sucesso",
          description: "Recibo enviado para impressora",
        });
      }
    }
  };

  // Atualizar botão
  <Button
    type="button"
    variant="outline"
    size="icon"
    onClick={handlePrint}
    title={connected ? "Imprimir recibo" : "Conectar impressora"}
  >
    <Printer className="h-4 w-4" />
  </Button>
}
```

## 🧪 Testando

1. Instale a biblioteca:
   ```bash
   npm install @capacitor-community/bluetooth-le
   ```

2. Sincronize com Capacitor:
   ```bash
   npx cap sync
   ```

3. Adicione as permissões conforme acima

4. Teste em um dispositivo real (Bluetooth não funciona em emuladores)

## 📝 Notas Importantes

- **UUIDs**: Cada impressora pode ter UUIDs diferentes. Consulte a documentação da sua impressora.
- **Comandos ESC/POS**: Os comandos podem variar entre modelos. Teste com sua impressora específica.
- **Permissões**: No Android 12+, você precisará solicitar permissões em runtime.
- **iOS**: Bluetooth LE tem mais restrições no iOS. Teste cuidadosamente.

## 🔗 Recursos

- [Capacitor Bluetooth LE](https://github.com/capacitor-community/bluetooth-le)
- [Comandos ESC/POS](https://reference.epson-biz.com/modules/ref_escpos/)
- [Guia de Impressão Térmica](https://escpos.readthedocs.io/)

---

**Boa impressão! ☕🖨️**
