// Netlify Function: AI 레시피 추천
// 프런트엔드(index.html)가 /.netlify/functions/recommend 로 보내는 요청을 받아
// OpenAI를 호출하고, API 키는 서버(여기)에만 두기 때문에 외부에 노출되지 않습니다.
//
// 필요한 환경변수 (Netlify 사이트 설정 > Environment variables):
//   OPENAI_API_KEY = sk-... (사주/타로 앱에서 쓰던 그 키 그대로 사용 가능)
//
// 모델을 바꾸고 싶으면 아래 MODEL 값만 수정하세요. (gpt-4o-mini = 저렴/빠름)

const MODEL = "gpt-4o-mini";

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST")
    return { statusCode: 405, headers, body: JSON.stringify({ error: "POST only" }) };

  const key = process.env.OPENAI_API_KEY;
  if (!key)
    return { statusCode: 500, headers, body: JSON.stringify({ error: "OPENAI_API_KEY 미설정" }) };

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch (e) {}

  // 상태 점검용 핑
  if (body.ping) return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };

  const ingredients = Array.isArray(body.ingredients) ? body.ingredients : [];
  const expiring = Array.isArray(body.expiring) ? body.expiring : [];
  if (!ingredients.length)
    return { statusCode: 400, headers, body: JSON.stringify({ error: "재료가 없습니다" }) };

  const sys =
    "너는 한국 가정식 요리를 잘 아는 친절한 요리 도우미야. " +
    "사용자의 냉장고 재료로 만들 수 있는 현실적인 집밥 레시피 3개를 추천해. " +
    "유통기한이 임박한 재료를 최대한 먼저 소진하는 메뉴를 우선해. " +
    "꼭 아래 JSON 형식 '그대로'만 출력하고, 다른 말/마크다운/코드블록은 절대 쓰지 마. " +
    '{"recipes":[{"name":"메뉴명","reason":"왜 추천하는지 한 줄(임박 재료 언급)",' +
    '"have":["집에 있는 재료"],"need":["추가로 사야 할 재료"],"steps":["조리 1","조리 2","조리 3"]}]}';

  const user =
    `[냉장고에 있는 재료]\n${ingredients.join(", ")}\n\n` +
    `[유통기한 임박 재료(우선 소진)]\n${expiring.length ? expiring.join(", ") : "없음"}\n\n` +
    `위 재료로 만들 수 있는 한국 가정식 3가지를 JSON으로만 추천해줘. ` +
    `steps는 3~5단계로 간단히. have에는 위 재료 중 실제로 쓰는 것만 적어줘.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        temperature: 0.6,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: "OpenAI 오류", detail: t.slice(0, 300) }) };
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || "{}";
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()); }

    return { statusCode: 200, headers, body: JSON.stringify({ recipes: parsed.recipes || [] }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(err).slice(0, 300) }) };
  }
};
