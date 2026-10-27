const express = require("express");
const Database = require("better-sqlite3");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(express.json({limit:"100kb"}));
app.use(express.static(path.join(__dirname,"public")));
const PORT = process.env.PORT || 3000;
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const BASE_URL = process.env.BASE_URL; // Ex.: https://seu-site.onrender.com
const WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET || "";

const products = {
  prompts: { name:"Kit de Prompts para Criadores", price:9.90, file:"kit-prompts-ia.txt" },
  planner: { name:"Planner de Conteúdo", price:7.90, file:"planner-conteudo.csv" },
  streamer: { name:"Kit Inicial de Streamer", price:8.90, file:"kit-streamer.txt" }
};
const db = new Database(process.env.DB_PATH || path.join(__dirname,"orders.db"));
db.pragma("journal_mode = WAL");
db.exec(`CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL, email TEXT NOT NULL,
  amount REAL NOT NULL, status TEXT NOT NULL, payment_id TEXT,
  created_at TEXT NOT NULL
)`);
const insertOrder = db.prepare("INSERT INTO orders (id,product_id,email,amount,status,created_at) VALUES (?,?,?,?,?,?)");
const getOrder = db.prepare("SELECT * FROM orders WHERE id=?");
const updatePayment = db.prepare("UPDATE orders SET payment_id=?,status=? WHERE id=?");
const updateStatus = db.prepare("UPDATE orders SET status=? WHERE id=?");

function requireConfig(res) {
  if (!MP_ACCESS_TOKEN || !BASE_URL || !BASE_URL.startsWith("https://")) {
    res.status(503).json({error:"Pagamentos ainda não configurados. O administrador precisa configurar MP_ACCESS_TOKEN e BASE_URL no servidor."});
    return false;
  }
  return true;
}
function verifyWebhookSignature(req) {
  // Validação HMAC do Mercado Pago quando a assinatura secreta foi configurada.
  if (!WEBHOOK_SECRET) return false;
  const xSignature = req.get("x-signature") || "";
  const xRequestId = req.get("x-request-id") || "";
  const dataId = String(req.query["data.id"] || req.body?.data?.id || "").toLowerCase();
  const parts = Object.fromEntries(xSignature.split(",").map(p=>p.trim().split("=",2)));
  if (!parts.ts || !parts.v1 || !dataId) return false;
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${parts.ts};`;
  const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(manifest).digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(parts.v1)); } catch { return false; }
}
async function mpGetPayment(paymentId) {
  const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers:{Authorization:`Bearer ${MP_ACCESS_TOKEN}`}
  });
  if (!r.ok) throw new Error("Falha ao consultar pagamento no provedor");
  return r.json();
}

app.get("/api/health", (_req,res)=>res.json({ok:true, paymentConfigured:!!MP_ACCESS_TOKEN && !!BASE_URL}));

app.post("/api/orders", async (req,res)=>{
  if (!requireConfig(res)) return;
  const {productId,email} = req.body || {};
  const product = products[productId];
  if (!product) return res.status(400).json({error:"Produto inválido."});
  if (typeof email!=="string" || email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:"Informe um e-mail válido."});
  const orderId = crypto.randomUUID();
  insertOrder.run(orderId,productId,email,product.price,"pending",new Date().toISOString());
  try {
    const payload = {
      transaction_amount: product.price,
      description: product.name,
      payment_method_id: "pix",
      payer: { email },
      external_reference: orderId,
      notification_url: `${BASE_URL.replace(/\/$/,"")}/api/webhooks/mercadopago`,
      metadata: { order_id: orderId, product_id: productId }
    };
    const r = await fetch("https://api.mercadopago.com/v1/payments", {
      method:"POST",
      headers:{
        Authorization:`Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type":"application/json",
        "X-Idempotency-Key":orderId
      },
      body:JSON.stringify(payload)
    });
    const payment = await r.json();
    if (!r.ok) {
      updateStatus.run("error",orderId);
      console.error("Mercado Pago error:",payment);
      return res.status(502).json({error:"O provedor não conseguiu gerar o Pix. Revise a configuração ou tente novamente."});
    }
    updatePayment.run(String(payment.id),"pending",orderId);
    const tx = payment.point_of_interaction?.transaction_data || {};
    res.json({orderId, qrCode:tx.qr_code || "", qrCodeBase64:tx.qr_code_base64 || ""});
  } catch (e) {
    updateStatus.run("error",orderId);
    console.error(e);
    res.status(502).json({error:"Erro ao conectar com o provedor de pagamento."});
  }
});

app.get("/api/orders/:id", (req,res)=>{
  const order = getOrder.get(req.params.id);
  if (!order) return res.status(404).json({error:"Pedido não encontrado."});
  // Status público limitado; não expõe e-mail, token ou dados do provedor.
  res.json({orderId:order.id,status:order.status,productId:order.product_id});
});

app.get("/api/orders/:id/download", (req,res)=>{
  const order = getOrder.get(req.params.id);
  if (!order) return res.status(404).send("Pedido não encontrado.");
  if (order.status !== "approved") return res.status(403).send("O download só fica disponível após a confirmação do pagamento.");
  const product = products[order.product_id];
  const file = path.join(__dirname,"private_downloads",product.file);
  if (!fs.existsSync(file)) return res.status(404).send("Arquivo não encontrado.");
  res.download(file,product.file);
});

app.post("/api/webhooks/mercadopago", async (req,res)=>{
  // Configure a assinatura secreta no painel do Mercado Pago antes de produção.
  if (!verifyWebhookSignature(req)) return res.status(401).send("Assinatura inválida ou não configurada.");
  const paymentId = req.query["data.id"] || req.body?.data?.id;
  if (!paymentId || !MP_ACCESS_TOKEN) return res.status(400).send("Notificação inválida.");
  try {
    const payment = await mpGetPayment(paymentId);
    const orderId = payment.external_reference;
    const order = orderId ? getOrder.get(orderId) : null;
    if (!order || String(order.payment_id)!==String(payment.id)) return res.status(200).send("Ignorado");
    const expected = products[order.product_id];
    // Confere status, valor e moeda; nunca confia só no conteúdo do webhook.
    if (payment.currency_id !== "BRL" || Number(payment.transaction_amount)!==Number(order.amount)) {
      console.error("Divergência de valor/moeda no pedido",order.id);
      return res.status(200).send("Divergência registrada");
    }
    if (payment.status === "approved") updateStatus.run("approved",order.id);
    else if (["rejected","cancelled","refunded","charged_back"].includes(payment.status)) updateStatus.run("rejected",order.id);
    return res.status(200).send("OK");
  } catch (e) {
    console.error(e);
    return res.status(500).send("Erro ao processar notificação");
  }
});

app.listen(PORT,()=>console.log(`Gamer IA Store ouvindo na porta ${PORT}`));
