import { Router } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { getUserId } from "../lib/auth.js";
import { uploadLimiter } from "../lib/ratelimit.js";

export const attachmentsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 }, // 8 MB
});

// Receipts are stored as bytes inside Postgres, so they consume database
// storage directly. Cap what one account can hold and how many files hang off a
// single transaction, or one user could fill the disk.
const MAX_TOTAL_BYTES_PER_USER = 250 * 1024 * 1024; // 250 MB
const MAX_FILES_PER_TRANSACTION = 10;

// GET /api/attachments?transactionId=... — metadata for a transaction's files.
attachmentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const transactionId = String(req.query.transactionId ?? "");
    if (!transactionId) throw new HttpError(400, "transactionId is required.");
    const items = await prisma.attachment.findMany({
      where: { userId, transactionId },
      orderBy: { createdAt: "asc" },
      select: { id: true, filename: true, mimeType: true, size: true, createdAt: true },
    });
    res.json(items);
  })
);

// POST /api/attachments?transactionId=... — multipart upload (field `file`).
attachmentsRouter.post(
  "/",
  uploadLimiter,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const transactionId = String(req.query.transactionId ?? "");
    if (!req.file) throw new HttpError(400, "No file uploaded (field name 'file').");

    const txn = await prisma.transaction.findFirst({ where: { id: transactionId, userId } });
    if (!txn) throw new HttpError(404, "Transaction not found");

    const [used, onTxn] = await Promise.all([
      prisma.attachment.aggregate({ where: { userId }, _sum: { size: true } }),
      prisma.attachment.count({ where: { userId, transactionId } }),
    ]);
    if (onTxn >= MAX_FILES_PER_TRANSACTION) {
      throw new HttpError(
        400,
        `A transaction can have at most ${MAX_FILES_PER_TRANSACTION} attachments.`
      );
    }
    const totalAfter = (used._sum.size ?? 0) + req.file.size;
    if (totalAfter > MAX_TOTAL_BYTES_PER_USER) {
      const mb = Math.round(MAX_TOTAL_BYTES_PER_USER / (1024 * 1024));
      throw new HttpError(
        413,
        `Attachment storage limit reached (${mb} MB). Delete some receipts to free space.`
      );
    }

    const created = await prisma.attachment.create({
      data: {
        userId,
        transactionId,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        data: new Uint8Array(req.file.buffer),
      },
      select: { id: true, filename: true, mimeType: true, size: true, createdAt: true },
    });
    res.status(201).json(created);
  })
);

// GET /api/attachments/:id — download the file.
attachmentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const att = await prisma.attachment.findFirst({
      where: { id: req.params.id, userId: getUserId(req) },
    });
    if (!att) throw new HttpError(404, "Attachment not found");
    res.setHeader("Content-Type", att.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${att.filename.replace(/"/g, "")}"`);
    res.send(Buffer.from(att.data));
  })
);

attachmentsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = await prisma.attachment.deleteMany({
      where: { id: req.params.id, userId: getUserId(req) },
    });
    if (result.count === 0) throw new HttpError(404, "Attachment not found");
    res.status(204).end();
  })
);
