const express = require("express");
const router = express.Router();
const prisma = require("../prisma");
const { Prisma } = require("@prisma/client");
const { dishFuzzyScoreSql, dishFulltextDocumentSql, normalizeSearchSql, FUZZY_SIMILARITY_THRESHOLD } = require("../search");
const { parseValidId, validateDish } = require("../validation");
const { authenticateToken } = require("../middleware/authenticateToken");
const { requireRole } = require("../middleware/authorize");

// GET /api/dishes - Tìm kiếm, lọc và phân trang món ăn ở database.
router.get("/", async (req, res, next) => {
  try {
    const categories = [
      "Khai Vị",
      "Món Cơm",
      "Món Khô",
      "Món Lẩu",
      "Món Nước",
      "Món Nướng",
      "Tráng Miệng",
      "Đồ Uống",
    ];
    const modes = ["basic", "advanced", "fulltext", "fuzzy"];
    const sorts = ["id_asc", "name_asc", "name_desc", "price_asc", "price_desc"];
    const errors = {};
    const readString = (key) => {
      const value = req.query[key];
      if (value === undefined) return undefined;
      if (typeof value !== "string") {
        errors[key] = "Phải là một giá trị chuỗi duy nhất";
        return undefined;
      }
      return value.trim();
    };
    const parsePositiveInteger = (key, fallback, maximum = Number.MAX_SAFE_INTEGER) => {
      const raw = readString(key);
      if (raw === undefined) return fallback;
      if (!/^\d+$/.test(raw)) {
        errors[key] = "Phải là số nguyên dương";
        return fallback;
      }
      const value = Number(raw);
      if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
        errors[key] = `Phải là số nguyên dương không vượt quá ${maximum}`;
        return fallback;
      }
      return value;
    };
    const q = readString("q") || "";
    const category = readString("category") || "";
    const minPriceText = readString("minPrice");
    const maxPriceText = readString("maxPrice");
    const availableValue = readString("available");
    const legacyStatus = readString("status");
    const availableText =
      availableValue !== undefined
        ? availableValue
        : legacyStatus === "available"
          ? "true"
          : legacyStatus === "unavailable"
            ? "false"
            : undefined;
    const modeValue = readString("mode");
    const matchValue = readString("match");
    const mode =
      modeValue === undefined
        ? category || legacyStatus
          ? "advanced"
          : "basic"
        : modeValue;
    const sortValue = readString("sort");
    const sort = sortValue === undefined ? "id_asc" : sortValue;
    const match = matchValue || (mode === "fulltext" || mode === "fuzzy" ? mode : "literal");
    const pageSize = parsePositiveInteger("pageSize", 10, 100);
    const page = parsePositiveInteger("page", 1, Math.floor(Number.MAX_SAFE_INTEGER / pageSize));
    const price = (key, value) => {
      if (value === undefined || value === "") return null;
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) {
        errors[key] = "Phải là số hữu hạn không âm";
        return null;
      }
      return parsed;
    };
    const minPrice = price("minPrice", minPriceText);
    const maxPrice = price("maxPrice", maxPriceText);

    if (!modes.includes(mode)) errors.mode = "Chế độ tìm kiếm không được hỗ trợ";
    if (!["literal", "fulltext", "fuzzy"].includes(match)) errors.match = "Quy tắc tìm kiếm không được hỗ trợ";
    if (!sorts.includes(sort)) errors.sort = "Kiểu sắp xếp không được hỗ trợ";
    if (category && !categories.includes(category)) errors.category = "Danh mục không được hỗ trợ";
    if (
      legacyStatus !== undefined &&
      legacyStatus !== "" &&
      legacyStatus !== "available" &&
      legacyStatus !== "unavailable"
    ) {
      errors.status = 'Chỉ chấp nhận "available" hoặc "unavailable"';
    }
    if (
      availableText !== undefined &&
      availableText !== "" &&
      availableText !== "true" &&
      availableText !== "false"
    ) {
      errors.available = 'Chỉ chấp nhận "true" hoặc "false"';
    }
    if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
      errors.minPrice = "Giá tối thiểu không được lớn hơn giá tối đa";
    }
    if ((mode === "fulltext" || mode === "fuzzy") && !q) {
      errors.q = "Chế độ này yêu cầu từ khóa q không rỗng";
    }
    if (Object.keys(errors).length) {
      return res.status(200).json({
        ok: false,
        data: null,
        error: {
          code: "VALIDATION_FAILED",
          message: "Tham số danh sách món ăn không hợp lệ",
          fields: errors,
        },
      });
    }

    const escapeLikeLiteral = (text) =>
      `%${text.replace(/!/g, "!!").replace(/%/g, "!%").replace(/_/g, "!_")}%`;
    const predicates = [];
    const fuzzyScore = dishFuzzyScoreSql(q);
    const fulltextDocument = dishFulltextDocumentSql();
    const fulltextQuery = Prisma.sql`plainto_tsquery('simple', ${normalizeSearchSql(q)})`;
    if (q)
    {
      if (match === "fulltext")
      {
        predicates.push(Prisma.sql`${fulltextDocument} @@ ${fulltextQuery}`);
      }
      else if (match === "fuzzy")
      {
        predicates.push(Prisma.sql`${fuzzyScore} >= ${FUZZY_SIMILARITY_THRESHOLD}`);
      }
      else
      {
        predicates.push(Prisma.sql`d.name ILIKE ${escapeLikeLiteral(q)} ESCAPE '!'`);
      }
    }
    if (mode === "advanced") {
      if (category) predicates.push(Prisma.sql`d.category = ${category}`);
      if (minPrice !== null) predicates.push(Prisma.sql`d.price >= ${minPrice}`);
      if (maxPrice !== null) predicates.push(Prisma.sql`d.price <= ${maxPrice}`);
      if (availableText !== undefined && availableText !== "") {
        predicates.push(Prisma.sql`d.available = ${availableText === "true"}`);
      }
    }
    const where = predicates.length
      ? Prisma.sql`WHERE ${Prisma.join(predicates, " AND ")}`
      : Prisma.empty;
    const offset = (page - 1) * pageSize;
    const orderBy = {
      id_asc: Prisma.sql`d.id ASC`,
      name_asc: Prisma.sql`d.name ASC, d.id ASC`,
      name_desc: Prisma.sql`d.name DESC, d.id ASC`,
      price_asc: Prisma.sql`d.price ASC, d.id ASC`,
      price_desc: Prisma.sql`d.price DESC, d.id ASC`,
    };
    const selected = q && match === "fulltext"
      ? Prisma.sql`SELECT d.id, ts_rank(${fulltextDocument}, ${fulltextQuery}) AS "searchScore" FROM dishes d ${where} ORDER BY "searchScore" DESC, d.id ASC LIMIT ${pageSize} OFFSET ${offset}`
      : q && match === "fuzzy"
        ? Prisma.sql`SELECT d.id, ${fuzzyScore} AS "searchScore" FROM dishes d ${where} ORDER BY "searchScore" DESC, d.id ASC LIMIT ${pageSize} OFFSET ${offset}`
        : Prisma.sql`SELECT d.id FROM dishes d ${where} ORDER BY ${orderBy[sort]} LIMIT ${pageSize} OFFSET ${offset}`;
    const [countRows, selectedRows] = await Promise.all([
      prisma.$queryRaw(Prisma.sql`SELECT COUNT(*)::int AS total FROM dishes d ${where}`),
      prisma.$queryRaw(selected),
    ]);
    const ids = selectedRows.map((row) => row.id);
    const relationRows = ids.length
      ? await prisma.dish.findMany({
          where: { id: { in: ids } },
          include: { chef: true, ingredients: true },
        })
      : [];
    const byId = new Map(relationRows.map((dish) => [dish.id, dish]));
    const items = selectedRows.map((row) => ({
      ...byId.get(row.id),
      ...(row.searchScore === undefined ? {} : { searchScore: Number(row.searchScore) }),
    }));

    return res.status(200).json({
      ok: true,
      data: { items, total: countRows[0].total, page, pageSize },
      error: null,
    });
  } catch (error) {
    next(error);
  }
});

// 2. GET /api/dishes/:id - Xem chi tiết một món ăn
router.get("/:id", async (req, res, next) => {
  try {
    const id = parseValidId(req.params.id);
    if (id === null) {
      return res.status(200).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Không tìm thấy món ăn",
        },
      });
    }

    const dish = await prisma.dish.findUnique({
      where: { id },
      include: {
        chef: true,
        ingredients: true,
      },
    });

    if (!dish) {
      return res.status(200).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Không tìm thấy món ăn",
        },
      });
    }

    return res.status(200).json({
      ok: true,
      data: dish,
    });
  } catch (error) {
    next(error);
  }
});

// 3. POST /api/dishes - Thêm món ăn mới (Yêu cầu xác thực đăng nhập Bearer Token)
router.post("/", authenticateToken, async (req, res, next) => {
  try {
    const validation = validateDish(req.body, false);
    if (!validation.isValid) {
      return res.status(200).json({
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "Dữ liệu món ăn không hợp lệ",
          fields: validation.fields,
        },
      });
    }

    const chefId = validation.data.chefId || req.user.chefId || null;
    const status = req.body.status === "draft" ? "draft" : "published";

    // Kiểm tra đầu bếp nếu có chọn
    if (chefId) {
      const chefExists = await prisma.chef.findUnique({
        where: { id: chefId },
      });
      if (!chefExists) {
        return res.status(200).json({
          ok: false,
          error: {
            code: "VALIDATION_FAILED",
            message: "Đầu bếp được chọn không tồn tại",
            fields: { chefId: "Vui lòng chọn đầu bếp hợp lệ" },
          },
        });
      }
    }

    // Kiểm tra nguyên liệu nếu có chọn
    if (validation.ingredientIds && validation.ingredientIds.length > 0) {
      const existingIngredients = await prisma.ingredient.findMany({
        where: { id: { in: validation.ingredientIds } },
        select: { id: true },
      });
      if (existingIngredients.length !== validation.ingredientIds.length) {
        return res.status(200).json({
          ok: false,
          error: {
            code: "VALIDATION_FAILED",
            message: "Một hoặc nhiều nguyên liệu không tồn tại",
            fields: { ingredientIds: "Vui lòng chọn nguyên liệu hợp lệ" },
          },
        });
      }
    }

    // Tạo bản ghi an toàn với các trường đã whitelist
    const createData = {
      name: validation.data.name,
      description: validation.data.description,
      price: validation.data.price,
      category: validation.data.category,
      available: validation.data.available,
      imageUrl: validation.data.imageUrl,
      status,
    };

    if (chefId) {
      createData.chef = { connect: { id: chefId } };
    }
    if (validation.ingredientIds && validation.ingredientIds.length > 0) {
      createData.ingredients = {
        connect: validation.ingredientIds.map((id) => ({ id })),
      };
    }

    const newDish = await prisma.dish.create({
      data: createData,
      include: {
        chef: true,
        ingredients: true,
      },
    });

    return res.status(200).json({
      ok: true,
      data: newDish,
    });
  } catch (error) {
    next(error);
  }
});

// 4. PATCH /api/dishes/:id - Chỉnh sửa món ăn (Yêu cầu xác thực đăng nhập Bearer Token)
router.patch("/:id", authenticateToken, async (req, res, next) => {
  try {
    const id = parseValidId(req.params.id);
    if (id === null) {
      return res.status(404).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Không tìm thấy món ăn",
        },
      });
    }

    const existing = await prisma.dish.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Không tìm thấy món ăn",
        },
      });
    }

    const validation = validateDish(req.body, true);
    if (!validation.isValid) {
      return res.status(200).json({
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "Dữ liệu món ăn không hợp lệ",
          fields: validation.fields,
        },
      });
    }

    // Kiểm tra đầu bếp nếu sửa chefId
    if (validation.data.chefId !== undefined) {
      if (validation.data.chefId !== null) {
        const chefExists = await prisma.chef.findUnique({
          where: { id: validation.data.chefId },
        });
        if (!chefExists) {
          return res.status(200).json({
            ok: false,
            error: {
              code: "VALIDATION_FAILED",
              message: "Đầu bếp được chọn không tồn tại",
              fields: { chefId: "Vui lòng chọn đầu bếp hợp lệ" },
            },
          });
        }
      }
    }

    // Kiểm tra nguyên liệu nếu sửa ingredientIds
    if (validation.ingredientIds !== undefined && validation.ingredientIds.length > 0) {
      const existingIngredients = await prisma.ingredient.findMany({
        where: { id: { in: validation.ingredientIds } },
        select: { id: true },
      });
      if (existingIngredients.length !== validation.ingredientIds.length) {
        return res.status(200).json({
          ok: false,
          error: {
            code: "VALIDATION_FAILED",
            message: "Một hoặc nhiều nguyên liệu không tồn tại",
            fields: { ingredientIds: "Vui lòng chọn nguyên liệu hợp lệ" },
          },
        });
      }
    }

    const updateData = {};
    if (validation.data.name !== undefined) updateData.name = validation.data.name;
    if (validation.data.description !== undefined) updateData.description = validation.data.description;
    if (validation.data.price !== undefined) updateData.price = validation.data.price;
    if (validation.data.category !== undefined) updateData.category = validation.data.category;
    if (validation.data.available !== undefined) updateData.available = validation.data.available;
    if (validation.data.imageUrl !== undefined) updateData.imageUrl = validation.data.imageUrl;

    if (validation.data.chefId !== undefined) {
      if (validation.data.chefId === null) {
        updateData.chef = { disconnect: true };
      } else {
        updateData.chef = { connect: { id: validation.data.chefId } };
      }
    }

    if (req.body.status && ["draft", "published"].includes(req.body.status)) {
      updateData.status = req.body.status;
    }

    if (validation.ingredientIds !== undefined) {
      updateData.ingredients = {
        set: validation.ingredientIds.map((ingId) => ({ id: ingId })),
      };
    }

    const updatedDish = await prisma.dish.update({
      where: { id },
      data: updateData,
      include: {
        chef: true,
        ingredients: true,
      },
    });

    return res.status(200).json({
      ok: true,
      data: updatedDish,
    });
  } catch (error) {
    next(error);
  }
});

// 5. DELETE /api/dishes/:id - Xóa món ăn (Yêu cầu xác thực đăng nhập Bearer Token)
router.delete("/:id", authenticateToken, async (req, res, next) => {
  try {
    const id = parseValidId(req.params.id);
    if (id === null) {
      return res.status(404).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Không tìm thấy món ăn",
        },
      });
    }

    const existing = await prisma.dish.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Không tìm thấy món ăn",
        },
      });
    }

    await prisma.dish.delete({ where: { id } });

    return res.status(200).json({
      ok: true,
      data: null,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
