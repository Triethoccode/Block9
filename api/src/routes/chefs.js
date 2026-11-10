const express = require("express");
const router = express.Router();
const prisma = require("../prisma");
const { parseValidId, validateChef } = require("../validation");
const { authenticateToken } = require("../middleware/authenticateToken");
const { requireRole } = require("../middleware/authorize");

// 1. GET /api/chefs - Danh sách đầu bếp (có tìm kiếm q)
router.get("/", async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const where = q
      ? {
          name: { contains: q.replace(/[\\%_]/g, "\\$&"), mode: "insensitive" },
        }
      : {};

    const chefs = await prisma.chef.findMany({
      where,
      include: {
        dishes: {
          select: { id: true, name: true, price: true, category: true, available: true },
        },
      },
      orderBy: { id: "asc" },
    });

    return res.status(200).json({
      ok: true,
      data: chefs,
    });
  } catch (error) {
    next(error);
  }
});

// 2. GET /api/chefs/:id - Chi tiết một đầu bếp
router.get("/:id", async (req, res, next) => {
  try {
    const id = parseValidId(req.params.id);
    if (id === null) {
      return res.status(200).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Không tìm thấy đầu bếp",
        },
      });
    }

    const chef = await prisma.chef.findUnique({
      where: { id },
      include: {
        dishes: {
          select: { id: true, name: true, price: true, category: true, available: true },
        },
      },
    });

    if (!chef) {
      return res.status(200).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Không tìm thấy đầu bếp",
        },
      });
    }

    return res.status(200).json({
      ok: true,
      data: chef,
    });
  } catch (error) {
    next(error);
  }
});

// 3. POST /api/chefs - Thêm đầu bếp mới (Yêu cầu đăng nhập)
router.post("/", authenticateToken, async (req, res, next) => {
  try {
    const validation = validateChef(req.body, false);
    if (!validation.isValid) {
      return res.status(200).json({
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "Dữ liệu đầu bếp không hợp lệ",
          fields: validation.fields,
        },
      });
    }

    const newChef = await prisma.chef.create({
      data: {
        name: validation.data.name,
        specialty: validation.data.specialty,
      },
    });

    return res.status(200).json({
      ok: true,
      data: newChef,
    });
  } catch (error) {
    next(error);
  }
});

// 4. PATCH /api/chefs/:id - Sửa thông tin đầu bếp (Yêu cầu đăng nhập)
router.patch("/:id", authenticateToken, async (req, res, next) => {
  try {
    const id = parseValidId(req.params.id);
    if (id === null) {
      return res.status(200).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Không tìm thấy đầu bếp",
        },
      });
    }

    const existing = await prisma.chef.findUnique({ where: { id } });
    if (!existing) {
      return res.status(200).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Không tìm thấy đầu bếp",
        },
      });
    }

    const validation = validateChef(req.body, true);
    if (!validation.isValid) {
      return res.status(200).json({
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "Dữ liệu đầu bếp không hợp lệ",
          fields: validation.fields,
        },
      });
    }

    const updateData = {};
    if (validation.data.name !== undefined) updateData.name = validation.data.name;
    if (validation.data.specialty !== undefined) updateData.specialty = validation.data.specialty;

    const updatedChef = await prisma.chef.update({
      where: { id },
      data: updateData,
    });

    return res.status(200).json({
      ok: true,
      data: updatedChef,
    });
  } catch (error) {
    next(error);
  }
});

// 5. DELETE /api/chefs/:id - Xóa đầu bếp (Yêu cầu đăng nhập)
router.delete("/:id", authenticateToken, async (req, res, next) => {
  try {
    const id = parseValidId(req.params.id);
    if (id === null) {
      return res.status(200).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Không tìm thấy đầu bếp",
        },
      });
    }

    const existing = await prisma.chef.findUnique({ where: { id } });
    if (!existing) {
      return res.status(200).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Không tìm thấy đầu bếp",
        },
      });
    }

    await prisma.chef.delete({ where: { id } });

    return res.status(200).json({
      ok: true,
      data: null,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
