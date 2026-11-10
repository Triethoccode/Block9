import { ArrowDown, ArrowRight, Search, X, UtensilsCrossed, Sparkles, Star, Leaf, ChefHat } from "lucide-react";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { dishApi } from "../../apiClient";
import { buildDishSearchParams } from "../../utils/search";
import { DishListSkeleton, ErrorAlert } from "../../components/StateViews";

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
const pageSizes = [10, 20, 50];

function setOptional(params, key, value) {
  if (value) params.set(key, value);
  else params.delete(key);
}

function DishCards({ dishes }) {
  return (
    <div className="menu-grid">
      {dishes.map((dish) => {
        const imgIndex = ((dish.id - 1) % 6) + 1;
        const fallbackImg = `/assets/img/food-${imgIndex}.svg`;
        const displayImg = dish.imageUrl || fallbackImg;

        return (
          <div key={dish.id} className="menu-item">
            <div className="menu-item__image">
              <img
                src={displayImg}
                alt={dish.name}
                onError={(event) => {
                  event.currentTarget.onerror = null;
                  event.currentTarget.src = fallbackImg;
                }}
              />
            </div>
            <div className="menu-item__info">
              <div className="menu-item__header">
                <Link to={`/dishes/${dish.id}`} className="menu-item__name" title={dish.name}>
                  {dish.name}
                </Link>
                <span className="menu-item__dots" />
                <span className="menu-item__price">{dish.price.toLocaleString("vi-VN")} đ</span>
              </div>
              <div className="dish-card-meta">
                <span className="dish-card-meta__line" title={dish.chef ? `Bếp: ${dish.chef.name}` : "Bếp: Đang cập nhật"}>
                  Bếp: {dish.chef ? dish.chef.name : "Đang cập nhật"}
                </span>
                <span
                  className="dish-card-meta__line"
                  title={
                    dish.ingredients?.length > 0
                      ? `Nguyên liệu: ${dish.ingredients.map((item) => item.name).join(", ")}`
                      : "Nguyên liệu: Đang cập nhật"
                  }
                >
                  Nguyên liệu:{" "}
                  {dish.ingredients?.length > 0
                    ? dish.ingredients.map((item) => item.name).join(", ")
                    : "Đang cập nhật"}
                </span>
              </div>
              <div className="menu-item__tags">
                {dish.category && <span className="menu-item__tag">{dish.category}</span>}
                <span
                  className={`menu-item__tag ${
                    dish.available
                      ? "menu-item__tag--available"
                      : "menu-item__tag--unavailable"
                  }`}
                >
                  {dish.available ? "Đang phục vụ" : "Tạm hết"}
                </span>
                <Link to={`/dishes/${dish.id}`} className="menu-item__tag menu-item__tag--unit">
                  Xem Chi Tiết <ArrowRight className="ui-icon" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function DishList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [draft, setDraft] = useState({
    q: "",
    category: "",
    minPrice: "",
    maxPrice: "",
    available: "",
    sort: "id_asc",
  });
  const [searchEpoch, setSearchEpoch] = useState(0);
  const [pageData, setPageData] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState(null);
  const [items, setItems] = useState([]);
  const [incrementalTotal, setIncrementalTotal] = useState(null);
  const [nextPage, setNextPage] = useState(1);
  const [pending, setPending] = useState(false);
  const [incrementalEnd, setIncrementalEnd] = useState(false);
  const [incrementalError, setIncrementalError] = useState(null);

  const paramsText = searchParams.toString();
  const appliedParams = useMemo(() => new URLSearchParams(paramsText), [paramsText]);
  const view = ["pages", "load-more", "infinite"].includes(appliedParams.get("view"))
    ? appliedParams.get("view")
    : "pages";
  const activeCategory = appliedParams.get("category") || "";
  const page = appliedParams.get("page") || "1";
  const pageSize = appliedParams.get("pageSize") || "10";
  const currentPage = Math.max(1, Number(page) || 1);
  const sentinelRef = useRef(null);
  const pendingRef = useRef(false);
  const endRef = useRef(false);
  const controllerRef = useRef(null);
  const generationRef = useRef(0);
  const incrementalKeyRef = useRef("");

  useEffect(() => {
    setDraft({
      q: appliedParams.get("q") || "",
      category: appliedParams.get("category") || "",
      minPrice: appliedParams.get("minPrice") || "",
      maxPrice: appliedParams.get("maxPrice") || "",
      available: appliedParams.get("available") ||
        (appliedParams.get("status") === "available" ? "true" : appliedParams.get("status") === "unavailable" ? "false" : ""),
      sort: appliedParams.get("sort") || "id_asc",
    });
  }, [paramsText, appliedParams]);

  const requestParams = useCallback(
    (requestPage) => buildDishSearchParams(new URLSearchParams(paramsText), "fuzzy", requestPage),
    [paramsText],
  );

  const pageRequest = useCallback(
    (signal) => dishApi.listPage(requestParams(page), signal),
    [page, requestParams],
  );

  useEffect(() => {
    if (view !== "pages") return undefined;
    const controller = new AbortController();
    let active = true;
    setPageData(null);
    setPageLoading(true);
    setPageError(null);
    pageRequest(controller.signal)
      .then((data) => {
        if (active) setPageData(data);
      })
      .catch((error) => {
        if (active && error.name !== "AbortError") setPageError(error);
      })
      .finally(() => {
        if (active) setPageLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [pageRequest, paramsText, searchEpoch, view]);

  const incrementalKey = useMemo(() => {
    const query = new URLSearchParams(paramsText);
    query.delete("page");
    query.delete("view");
    return `${view}:${query.toString()}`;
  }, [paramsText, view]);

  useLayoutEffect(() => {
    generationRef.current += 1;
    controllerRef.current?.abort();
    pendingRef.current = false;
    endRef.current = false;
    incrementalKeyRef.current = incrementalKey;
    setItems([]);
    setIncrementalTotal(null);
    setNextPage(1);
    setPending(false);
    setIncrementalEnd(false);
    setIncrementalError(null);
    return () => {
      generationRef.current += 1;
      controllerRef.current?.abort();
    };
  }, [incrementalKey, searchEpoch]);

  const loadNext = useCallback(async () => {
    if (pendingRef.current || endRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setIncrementalError(null);
    const generation = generationRef.current;
    const requestPage = nextPage;
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const data = await dishApi.listPage(
        requestParams(requestPage),
        controller.signal,
      );
      if (
        generation !== generationRef.current ||
        incrementalKey !== incrementalKeyRef.current
      ) {
        return;
      }
      setItems((current) => [...current, ...data.items]);
      setIncrementalTotal(data.total);
      setNextPage(data.page + 1);
      const reachedEnd = data.page * data.pageSize >= data.total || data.items.length === 0;
      endRef.current = reachedEnd;
      setIncrementalEnd(reachedEnd);
    } catch (error) {
      if (generation === generationRef.current && error.name !== "AbortError") {
        setIncrementalError(error);
      }
    } finally {
      if (generation === generationRef.current) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  }, [incrementalKey, nextPage, requestParams]);

  // Ở chế độ "Tải thêm" (load-more), tự động tải sẵn trang đầu tiên theo pageSize đã chọn
  useEffect(() => {
    if (
      view === "load-more" &&
      items.length === 0 &&
      nextPage === 1 &&
      !pending &&
      !incrementalEnd &&
      !incrementalError
    ) {
      loadNext();
    }
  }, [view, items.length, nextPage, pending, incrementalEnd, incrementalError, loadNext]);

  useEffect(() => {
    if (view !== "infinite" || incrementalEnd || !sentinelRef.current) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadNext();
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [incrementalEnd, items, loadNext, view]);

  const changeUrl = (updates, clearKeys = []) => {
    const params = new URLSearchParams(searchParams);
    params.set("mode", "advanced");
    params.set("match", "fuzzy");
    clearKeys.forEach((key) => params.delete(key));
    Object.entries(updates).forEach(([key, value]) => setOptional(params, key, String(value)));
    params.set("page", "1");
    setSearchParams(params);
  };

  const handleCategoryQuickFilter = (categoryValue) => {
    const params = new URLSearchParams(searchParams);
    params.set("mode", "advanced");
    params.set("match", "fuzzy");
    const nextCat = categoryValue === activeCategory ? "" : categoryValue;
    if (nextCat) {
      params.set("category", nextCat);
    } else {
      params.delete("category");
    }
    params.set("page", "1");
    setSearchParams(params);
    setSearchEpoch((epoch) => epoch + 1);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const params = new URLSearchParams(searchParams);
    params.set("mode", "advanced");
    params.set("match", "fuzzy");
    params.delete("status");
    setOptional(params, "q", draft.q.trim());
    setOptional(params, "sort", draft.sort);
    ["category", "minPrice", "maxPrice", "available"].forEach((key) =>
      setOptional(params, key, draft[key].trim()),
    );
    params.set("page", "1");
    setSearchParams(params);
    setSearchEpoch((epoch) => epoch + 1);
  };

  const clearConditions = () => {
    setDraft({
      q: "",
      category: "",
      minPrice: "",
      maxPrice: "",
      available: "",
      sort: "id_asc",
    });
    const params = new URLSearchParams();
    params.set("mode", "advanced");
    params.set("match", "fuzzy");
    params.set("view", view);
    params.set("pageSize", pageSize);
    params.set("page", "1");
    setSearchParams(params);
    setSearchEpoch((epoch) => epoch + 1);
  };

  const handlePageSize = (value) => changeUrl({ pageSize: value });
  const handleView = (value) => changeUrl({ view: value });
  const handlePage = (value) => {
    const params = new URLSearchParams(searchParams);
    params.set("mode", "advanced");
    params.set("match", "fuzzy");
    params.set("page", String(value));
    setSearchParams(params);
  };
  const retryPage = () => {
    setSearchEpoch((epoch) => epoch + 1);
  };

  const pageCount = pageData ? Math.ceil(pageData.total / pageData.pageSize) : 0;
  const pageWindow = Array.from(
    { length: Math.max(0, Math.min(pageCount, 5)) },
    (_, index) => {
      const first = Math.min(Math.max(1, currentPage - 2), Math.max(1, pageCount - 4));
      return first + index;
    },
  );
  const visiblePages = [...new Set([...(pageCount > 5 ? [1] : []), ...pageWindow, ...(pageCount > 5 ? [pageCount] : [])])];
  const shownDishes = view === "pages" ? pageData?.items || [] : items;
  const resultTotal = view === "pages" ? pageData?.total : incrementalTotal;
  const skeletonCount = pageSizes.includes(Number(pageSize)) ? Number(pageSize) : 10;

  return (
    <>
      <section className="page-hero menu-hero" aria-labelledby="menu-hero-title">
        <picture className="page-hero__bg" aria-hidden="true">
          <source media="(max-width: 600px)" srcSet="/assets/img/menu-hero-800.webp" />
          <img
            src="/assets/img/menu-hero-1600.webp"
            width="1600"
            height="666"
            alt=""
            fetchpriority="high"
            decoding="async"
          />
        </picture>
        <div className="page-hero__overlay" />
        <div className="container page-hero__content">
          <div className="hero-pill-badge">
            <span className="hero-pill-badge__dot" />
            <Sparkles size={13} color="#f59e0b" />
            <span>TINH HOA ẨM THỰC BISTRO VIỆT NAM</span>
          </div>

          <h1 id="menu-hero-title" className="page-hero__title">
            Hương vị Việt,
            <br />
            trọn vẹn từng món
          </h1>
          <p className="page-hero__description">
            Khám phá những món ăn quen thuộc được chuẩn bị với sự tận tâm cao nhất, kết hợp nguyên liệu tươi sạch và phong cách ẩm thực Bistro đương đại.
          </p>

          <div className="hero-actions">
            <a className="hero-btn-main" href="#thuc-don">
              Khám phá thực đơn <ArrowDown size={18} className="ui-icon" aria-hidden="true" />
            </a>
          </div>

          {/* Social Proof Strip (UI/UX Pro Max) */}
          <div className="hero-stats">
            <div className="hero-stat-item">
              <span className="hero-stat-number">
                <Star size={17} fill="#f59e0b" color="#f59e0b" style={{ display: "inline-block", marginRight: "4px" }} />
                4.9/5
              </span>
              <span className="hero-stat-label">Hơn 2,500+ đánh giá ẩm thực</span>
            </div>
            <div className="hero-stat-divider" aria-hidden="true" />
            <div className="hero-stat-item">
              <span className="hero-stat-number">
                <Leaf size={17} color="#10b981" style={{ display: "inline-block", marginRight: "4px" }} />
                100%
              </span>
              <span className="hero-stat-label">Nguyên liệu tươi sạch hữu cơ</span>
            </div>
            <div className="hero-stat-divider" aria-hidden="true" />
            <div className="hero-stat-item">
              <span className="hero-stat-number">
                <ChefHat size={17} color="#f59e0b" style={{ display: "inline-block", marginRight: "4px" }} />
                10+
              </span>
              <span className="hero-stat-label">Bếp trưởng đạt chuẩn</span>
            </div>
          </div>
        </div>
      </section>

      <section id="thuc-don" className="section menu-section">
        <div className="container">
          {/* Header thực đơn căn giữa với hoa văn trang trí */}
          <div className="section-header" style={{ marginBottom: "36px", marginTop: "8px", textAlign: "center" }}>
            <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "12px", marginBottom: "8px" }}>
              <span style={{ height: "1px", width: "42px", background: "linear-gradient(to right, transparent, #c5a880)" }}></span>
              <span style={{ 
                fontSize: "0.82rem", 
                fontWeight: "700", 
                letterSpacing: "4px", 
                textTransform: "uppercase", 
                color: "#c5a880"
              }}>
                RESTORAN CUISINE
              </span>
              <span style={{ height: "1px", width: "42px", background: "linear-gradient(to left, transparent, #c5a880)" }}></span>
            </div>

            <h2 style={{ 
              fontSize: "clamp(2.1rem, 3.8vw, 2.75rem)", 
              fontWeight: "700", 
              color: "#1a202c", 
              margin: "0 0 14px 0",
              fontFamily: "'Playfair Display', Georgia, serif",
              letterSpacing: "0.5px"
            }}>
              Thực Đơn Món Ăn
            </h2>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "14px", margin: "0 auto 14px" }}>
              <div style={{ width: "55px", height: "1.5px", background: "#c5a880", opacity: 0.8 }} />
              <UtensilsCrossed size={18} color="#c5a880" />
              <div style={{ width: "55px", height: "1.5px", background: "#c5a880", opacity: 0.8 }} />
            </div>

            <p style={{ 
              color: "#64748b", 
              fontSize: "0.98rem", 
              maxWidth: "520px", 
              margin: "0 auto",
              lineHeight: "1.6"
            }}>
              Khám phá tinh hoa ẩm thực truyền thống và đương đại, phục vụ tận tâm mỗi ngày.
            </p>
          </div>

          <div className="dish-search-panel">
            {/* 1. Khung chuyển đổi 3 chế độ phân trang được đẩy lên trên cùng */}
            <div className="dish-results-toolbar">
              <div className="dish-view-group">
                <span className="dish-view-label">Chế độ hiển thị:</span>
                <div className="dish-view-switch" role="group" aria-label="Kiểu hiển thị phân trang">
                  {[
                    ["pages", "Số trang"],
                    ["load-more", "Tải thêm"],
                    ["infinite", "Cuộn vô hạn"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={view === value}
                      className={view === value ? "is-active" : ""}
                      onClick={() => handleView(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {resultTotal !== null && resultTotal !== undefined && (
                <span className="dish-results-count">
                  {resultTotal.toLocaleString("vi-VN")} món phù hợp
                </span>
              )}
            </div>

            {/* 2. Thanh lọc nhanh theo danh mục (Tag Pills) gọn gàng */}
            <div className="dish-category-strip" role="group" aria-label="Lọc nhanh theo phân loại">
              <span className="category-filter-label">Phân loại:</span>
              <button
                type="button"
                className={`category-pill ${!activeCategory ? "active" : ""}`}
                onClick={() => handleCategoryQuickFilter("")}
              >
                Tất cả
              </button>
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  className={`category-pill ${activeCategory === category ? "active" : ""}`}
                  onClick={() => handleCategoryQuickFilter(category)}
                >
                  {category}
                </button>
              ))}
            </div>

            {/* 3. Form tìm kiếm và lọc chi tiết */}
            <form className="dish-search-form" onSubmit={handleSubmit}>
              <div className="dish-search-primary-fields dish-search-primary-fields--fixed">
                <div className="dish-form-field dish-form-field--query">
                  <label htmlFor="dish-search-query">Từ khóa</label>
                  <input
                    id="dish-search-query"
                    type="search"
                    aria-label="Tìm món ăn"
                    value={draft.q}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, q: event.target.value }))
                    }
                    placeholder="Tìm món ăn hoặc nguyên liệu..."
                  />
                </div>

                <div className="dish-form-field">
                  <label htmlFor="dish-search-sort">Sắp xếp</label>
                  <select
                    id="dish-search-sort"
                    value={draft.sort}
                    disabled={Boolean(draft.q.trim())}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, sort: event.target.value }))
                    }
                  >
                    <option value="id_asc">Mặc định</option>
                    <option value="name_asc">Tên A-Z</option>
                    <option value="name_desc">Tên Z-A</option>
                    <option value="price_asc">Giá tăng dần</option>
                    <option value="price_desc">Giá giảm dần</option>
                  </select>
                </div>

                <div className="dish-form-field">
                  <label htmlFor="dish-page-size">Món mỗi trang</label>
                  <select
                    id="dish-page-size"
                    value={pageSize}
                    onChange={(event) => handlePageSize(event.target.value)}
                  >
                    {pageSizes.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {(
                <div className="dish-search-advanced-fields">
                  <div className="dish-form-field">
                    <label htmlFor="dish-min-price">Giá từ</label>
                    <input
                      id="dish-min-price"
                      type="number"
                      min="0"
                      value={draft.minPrice}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, minPrice: event.target.value }))
                      }
                    />
                  </div>
                  <div className="dish-form-field">
                    <label htmlFor="dish-max-price">Đến giá</label>
                    <input
                      id="dish-max-price"
                      type="number"
                      min="0"
                      value={draft.maxPrice}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, maxPrice: event.target.value }))
                      }
                    />
                  </div>
                  <div className="dish-form-field">
                    <label htmlFor="dish-availability">Trạng thái</label>
                    <select
                      id="dish-availability"
                      value={draft.available}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, available: event.target.value }))
                      }
                    >
                      <option value="">Tất cả</option>
                      <option value="true">Còn bán</option>
                      <option value="false">Hết hàng</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="dish-search-footer">
                <div className="dish-search-actions">
                  <button className="btn btn--primary" type="submit">
                    <Search className="ui-icon" aria-hidden="true" /> Tìm kiếm
                  </button>
                  <button className="btn btn--outline" type="button" onClick={clearConditions}>
                    <X className="ui-icon" aria-hidden="true" /> Xóa điều kiện
                  </button>
                </div>
              </div>
            </form>
          </div>

          {view === "pages" && pageLoading && <DishListSkeleton count={skeletonCount} />}
          {view === "pages" && !pageLoading && pageError && (
            <ErrorAlert error={pageError} onRetry={retryPage} />
          )}
          {view !== "pages" && incrementalError && (
            <div className="dish-load-error" role="alert">
              <span>{incrementalError.message || "Không thể tải danh sách món ăn."}</span>
              <button type="button" className="btn btn--outline" onClick={loadNext}>
                Thử lại
              </button>
            </div>
          )}

          {resultTotal === 0 && (view === "pages" ? !pageLoading && !pageError : !pending && !incrementalError) && (
            <div className="dish-empty-state">Không tìm thấy món ăn phù hợp với điều kiện đã chọn.</div>
          )}
          {shownDishes.length > 0 &&
            (view !== "pages" || (!pageLoading && !pageError)) && (
              <DishCards dishes={shownDishes} />
            )}
          {view !== "pages" && pending && (
            <DishListSkeleton
              count={incrementalTotal === null ? skeletonCount : Math.min(skeletonCount, Math.max(1, incrementalTotal - items.length))}
              message={items.length > 0 ? "Đang tải thêm món ăn…" : "Đang tải danh sách món ăn…"}
            />
          )}

          {view === "pages" && !pageLoading && !pageError && pageData && pageCount > 0 && (
            <nav className="dish-pagination" aria-label="Phân trang món ăn">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => handlePage(currentPage - 1)}
              >
                Trước
              </button>
              {visiblePages.map((number, index) => (
                <React.Fragment key={number}>
                  {index > 0 && number - visiblePages[index - 1] > 1 && (
                    <span aria-hidden="true">…</span>
                  )}
                  <button
                    type="button"
                    className={number === currentPage ? "is-current" : ""}
                    aria-current={number === currentPage ? "page" : undefined}
                    onClick={() => handlePage(number)}
                  >
                    {number}
                  </button>
                </React.Fragment>
              ))}
              <button
                type="button"
                disabled={currentPage >= pageCount}
                onClick={() => handlePage(currentPage + 1)}
              >
                Sau
              </button>
            </nav>
          )}

          {view === "load-more" && (
            <div className="dish-load-more">
              {pending && <span>Đang tải...</span>}
              {incrementalEnd && <span>Đã hết món</span>}
              {!incrementalEnd && (
                <button type="button" className="btn btn--outline" onClick={loadNext} disabled={pending}>
                  {incrementalError ? "Thử lại" : "Tải thêm"}
                </button>
              )}
            </div>
          )}

          {view === "infinite" && (
            <>
              <div ref={sentinelRef} className="dish-scroll-sentinel" aria-hidden="true" />
              <div className="dish-load-more">
                {pending && <span>Đang tải...</span>}
                {incrementalEnd && <span>Đã hết món</span>}
                {!incrementalEnd && (
                  <button type="button" className="btn btn--outline" onClick={loadNext} disabled={pending}>
                    {incrementalError ? "Thử lại" : "Tải thêm"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}
