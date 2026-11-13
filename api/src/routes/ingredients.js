const express = require("express");
const router = express.Router();
const prisma = require("../prisma");
const { Prisma } = require("@prisma/client");
const { fuzzyScoreSql, FUZZY_SIMILARITY_THRESHOLD } = require("../search");
const { parseValidId, validateIngredient } = require("../validation");
const { authenticateToken } = require("../middleware/authenticateToken");
const { requireRole } = require("../middleware/authorize");

// Bắt buộc đăng nhập đối với toàn bộ tài nguyên nguyên liệu (Admin)
router.use(authenticateToken);

// 1. GET /api/ingredients - Danh sách nguyên liệu (có tìm kiếm q và lọc category)
router.get("/", async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
    const unit = typeof req.query.unit === "string" ? req.query.unit.trim() : "";
    const match = req.query.match || "literal";
    const invalidFields = Object.keys(req.query).filter((key) =>
      ["q", "category", "unit", "match", "mode"].includes(key) && typeof req.query[key] !== "string",
    );
    if (invalidFields.length || !["literal", "fuzzy"].includes(match) || (req.query.mode && req.query.mode !== "advanced"))
    {
      return res.status(200).json({
        ok: false,
        data: null,
        error: { code: "VALIDATION_FAILED", message: "Điều kiện tìm kiếm nguyên liệu không hợp lệ." },
      });
    }

    if (match === "fuzzy")
    {
      const score = fuzzyScoreSql(Prisma.sql`i.name`, q);
      const predicates = [];
      if (q)
      {
        predicates.push(Prisma.sql`${score} >= ${FUZZY_SIMILARITY_THRESHOLD}`);
      }
      if (category && !["tất cả", "all"].includes(category.toLowerCase()))
      {
        predicates.push(Prisma.sql`lower(coalesce(i.category, 'Khác')) = lower(${category})`);
      }
      if (unit)
      {
        predicates.push(Prisma.sql`lower(i.unit) = lower(${unit})`);
      }
      const where = predicates.length ? Prisma.sql`WHERE ${Prisma.join(predicates, " AND ")}` : Prisma.empty;
      const order = q ? Prisma.sql`${score} DESC, i.id ASC` : Prisma.sql`i.id ASC`;
      const selected = await prisma.$queryRaw(Prisma.sql`SELECT i.id FROM ingredients i ${where} ORDER BY ${order}`);
      const rows = selected.length ? await prisma.ingredient.findMany({
        where: { id: { in: selected.map((item) => item.id) } },
        include: { _count: { select: { dishes: true } } },
      }) : [];
      const byId = new Map(rows.map((item) => [item.id, item]));
      return res.status(200).json({ ok: true, data: selected.map((item) => byId.get(item.id)) });
    }

    const conditions = [];
    if (unit)
    {
      conditions.push({ unit: { equals: unit, mode: "insensitive" } });
    }

    if (q) {
      conditions.push({
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { unit: { contains: q, mode: "insensitive" } },
          { category: { contains: q, mode: "insensitive" } },
        ],
      });
    }

    if (category && category.toLowerCase() !== "tất cả" && category.toLowerCase() !== "all") {
      conditions.push({
        category: { equals: category, mode: "insensitive" },
      });
    }

    const where = conditions.length > 0 ? { AND: conditions } : {};

    const ingredients = await prisma.ingredient.findMany({
      where,
      include: {
        _count: { select: { dishes: true } },
      },
      orderBy: { id: "asc" },
    });

    return res.status(200).json({
      ok: true,
      data: ingredients,
    });
  } catch (error) {
    next(error);
  }
});

// 2. GET /api/ingredients/:id - Chi tiết một nguyên liệu
router.get("/:id", async (req, res, next) => {
  try {
    const id = parseValidId(req.params.id);
    if (id === null) {
      return res.status(200).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Không tìm thấy nguyên liệu",
        },
      });
    }

    const ingredient = await prisma.ingredient.findUnique({
      where: { id },
      include: {
        dishes: {
          select: { id: true, name: true, price: true, category: true, available: true },
        },
      },
    });

    if (!ingredient) {
      return res.status(200).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Không tìm thấy nguyên liệu",
        },
      });
    }

    return res.status(200).json({
      ok: true,
      data: ingredient,
    });
  } catch (error) {
    next(error);
  }
});

// 3. POST /api/ingredients - Thêm nguyên liệu mới (Yêu cầu đăng nhập)
router.post("/", authenticateToken, async (req, res, next) => {
  try {
    const validation = validateIngredient(req.body, false);
    if (!validation.isValid) {
      return res.status(200).json({
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "Dữ liệu nguyên liệu không hợp lệ",
          fields: validation.fields,
        },
      });
    }

    const newIngredient = await prisma.ingredient.create({
      data: {
        name: validation.data.name,
        quantity: validation.data.quantity,
        unit: validation.data.unit,
        category: validation.data.category || "Khác",
      },
    });

    return res.status(200).json({
      ok: true,
      data: newIngredient,
    });
  } catch (error) {
    next(error);
  }
});

// 4. PATCH /api/ingredients/:id - Sửa thông tin nguyên liệu (Yêu cầu đăng nhập)
router.patch("/:id", authenticateToken, async (req, res, next) => {
  try {
    const id = parseValidId(req.params.id);
    if (id === null) {
      return res.status(200).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Không tìm thấy nguyên liệu",
        },
      });
    }

    const existing = await prisma.ingredient.findUnique({ where: { id } });
    if (!existing) {
      return res.status(200).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Không tìm thấy nguyên liệu",
        },
      });
    }

    const validation = validateIngredient(req.body, true);
    if (!validation.isValid) {
      return res.status(200).json({
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "Dữ liệu nguyên liệu không hợp lệ",
          fields: validation.fields,
        },
      });
    }

    const updateData = {};
    if (validation.data.name !== undefined) updateData.name = validation.data.name;
    if (validation.data.unit !== undefined) updateData.unit = validation.data.unit;
    if (validation.data.quantity !== undefined) updateData.quantity = validation.data.quantity;
    if (validation.data.category !== undefined) updateData.category = validation.data.category;

    const updatedIngredient = await prisma.ingredient.update({
      where: { id },
      data: updateData,
    });

    return res.status(200).json({
      ok: true,
      data: updatedIngredient,
    });
  } catch (error) {
    next(error);
  }
});

// 5. DELETE /api/ingredients/:id - Xóa nguyên liệu (Yêu cầu đăng nhập)
router.delete("/:id", authenticateToken, async (req, res, next) => {
  try {
    const id = parseValidId(req.params.id);
    if (id === null) {
      return res.status(200).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Không tìm thấy nguyên liệu",
        },
      });
    }

    const existing = await prisma.ingredient.findUnique({
      where: { id },
      include: {
        dishes: {
          select: { id: true, name: true, category: true, imageUrl: true },
          orderBy: { name: "asc" },
        },
      },
    });
    if (!existing) {
      return res.status(200).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Không tìm thấy nguyên liệu",
        },
      });
    }

    if (existing.dishes && existing.dishes.length > 0) {
      return res.status(200).json({
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "Không thể xóa nguyên liệu đang được món ăn sử dụng. Vui lòng gỡ nguyên liệu khỏi các món ăn trước.",
        },
      });
    }

    await prisma.ingredient.delete({ where: { id } });

    return res.status(200).json({
      ok: true,
      data: null,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
