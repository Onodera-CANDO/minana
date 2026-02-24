/**
 * Chatwork API クライアント
 */

const CHATWORK_API_BASE = "https://api.chatwork.com/v2";

/**
 * Chatwork API にメッセージを送信する
 * @param {string} token - Chatwork API トークン
 * @param {string} roomId - ルームID
 * @param {string} message - 送信するメッセージ
 * @returns {Promise<{ success: boolean, messageId?: number, error?: string }>}
 */
export async function sendMessage(token, roomId, message) {
  if (!token || !roomId) {
    return {
      success: false,
      error: "CHATWORK_TOKEN と CHATWORK_ROOM_ID が必要です",
    };
  }

  try {
    const url = `${CHATWORK_API_BASE}/rooms/${roomId}/messages`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "X-ChatWorkToken": token,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ body: message }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: `API Error ${response.status}: ${text}` };
    }

    const data = await response.json();
    return { success: true, messageId: data.message_id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
