// /app/api/telegram/route.js
import TelegramBot from "node-telegram-bot-api";
import { NextResponse } from "next/server";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Move bot and state management to a separate utility file or initialize within handlers
let currentState = {
  positions: new Map(),
  accountName: "",
};

const sendMessage = async (message) => {
  const bot = new TelegramBot(BOT_TOKEN, { polling: false });
  try {
    await bot.sendMessage(CHAT_ID, message, { parse_mode: "HTML" });
  } catch (error) {
    console.error("Error sending telegram message:", error);
  }
};

const updateTradeState = (data) => {
  switch (data.type) {
    case "POSITION_OPENED":
      const { ticket, symbol, lots, profit, accountName } = data;
      currentState.positions.set(ticket, {
        symbol,
        lots,
        profit,
        type: "OPEN",
      });
      currentState.accountName = accountName;
      break;
    case "POSITION_CLOSED":
      currentState.positions.delete(data.ticket);
      currentState.accountName = data.accountName;
      break;
    case "POSITIONS_UPDATE":
      if (data.positions && Array.isArray(data.positions)) {
        currentState.positions.clear();
        data.positions.forEach((pos) => {
          currentState.positions.set(pos.ticket, {
            symbol: pos.symbol,
            lots: pos.lots,
            profit: pos.profit,
            type: "OPEN",
            orderType: pos.orderType,
          });
        });
      }
      currentState.accountName = data.accountName;
      break;
  }
};

const getCurrentState = () => {
  return {
    positions: Array.from(currentState.positions.entries()),
    accountName: currentState.accountName,
  };
};

function formatTradeMessage(data) {
  const { type, symbol, orderType, lots, profit, accountName } = data;
  return `
<b>${type === "POSITION_OPENED" ? "Открыто" : "Закрыто"}</b>
Аккаунт: ${accountName}
Инструмент: ${symbol}
Тип сделки: ${orderType}
Лот: ${lots}
Прибыль: ${profit > 0 ? "+" : ""}${profit}$
`;
}

function formatStatusMessage(state) {
  if (state.positions.length === 0) {
    return `
<b>Отчет о статусе</b>
Аккаунт: ${state.accountName}
Нет активных позиций.
`;
  }

  const positionsText = state.positions
    .map(
      ([ticket, position]) => `
Инструмент: ${position.symbol}
Тип сделки: ${position.orderType || ""}
Лот: ${position.lots}
Текущая прибыль: ${position.profit > 0 ? "+" : ""}${position.profit}$
`
    )
    .join("\n");

  return `
<b>Отчет о статусе</b>
Аккаунт: ${state.accountName}
Активные позиции:
${positionsText}
`;
}

// Next.js API route handlers
export async function POST(request) {
  try {
    const data = await request.json();
    console.log("Received data:", data);

    // Handle all types of MT5 updates
    updateTradeState(data);

    // Only send Telegram messages for opens and closes
    if (data.type === "POSITION_OPENED" || data.type === "POSITION_CLOSED") {
      const message = formatTradeMessage(data);
      await sendMessage(message);
    }

    // Handle Telegram commands
    if (data.message?.text === "/status") {
      const state = getCurrentState();
      const statusMessage = formatStatusMessage(state);
      await sendMessage(statusMessage);
    }

    return NextResponse.json({ status: "success" });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return NextResponse.json(
      { status: "error", message: error.message },
      { status: 500 }
    );
  }
}
