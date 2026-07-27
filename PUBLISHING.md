# Publishing to npm

Panduan untuk mempublish packages Syncraft Labs ke npm registry.

## Prerequisites

- Node.js ΓëÑ 20.0.0
- npm ΓëÑ 10.0.0
- Akun npm ([npmjs.com](https://www.npmjs.com/))

## Step 1: Buat Akun npm

Kalau belum punya akun:

1. Buka [npmjs.com/signup](https://www.npmjs.com/signup)
2. Buat akun (gratis)
3. Verifikasi email

## Step 2: Buat npm Organization (untuk scoped packages)

Karena packages menggunakan scope `@syncraft-labs/*`, kamu perlu membuat organization:

1. Login ke [npmjs.com](https://www.npmjs.com/)
2. Klik avatar ΓåÆ **Add an Organization**
3. Nama organization: `syncraft-labs`
4. Pilih **Unlimited public packages** (gratis)
5. Klik **Create**

> [!NOTE]
> Kalau nama `syncraft-labs` sudah diambil, kamu perlu ganti scope di semua `package.json`.
> Misalnya `@denislistiadi/core`, `@denislistiadi/react`, `@denislistiadi/vue`.

## Step 3: Login dari Terminal

```bash
npm login
```

Masukkan username, password, dan email. Kalau sudah login, verifikasi:

```bash
npm whoami
# Output: <username>
```

## Step 4: Build Semua Packages

```bash
# Dari root monorepo
npm run build
```

Pastikan semua packages berhasil build tanpa error.

## Step 5: Verify dengan Dry Run

Sebelum publish, cek dulu apa saja yang akan di-upload:

```bash
# Core
cd packages/core
npm pack --dry-run

# React
cd ../react
npm pack --dry-run

# Vue
cd ../vue
npm pack --dry-run
```

Output akan menunjukkan file-file yang masuk ke package. Pastikan:

- `dist/` folder ada (semua build output)
- `README.md` ada (muncul di halaman npm)
- `package.json` ada
- `src/` TIDAK ada (source code tidak perlu di-publish)
- `node_modules/` TIDAK ada
- `__tests__/` TIDAK ada

## Step 6: Publish!

**Urutan penting!** Publish `core` dulu karena `react` dan `vue` depend padanya.

```bash
# 1. Publish core dulu
cd packages/core
npm publish --access public

# 2. Lalu react
cd ../react
npm publish --access public

# 3. Lalu vue
cd ../vue
npm publish --access public
```

> [!IMPORTANT]
> Flag `--access public` **wajib** untuk scoped packages (`@syncraft-labs/*`).  
> Tanpa flag ini, npm akan menganggapnya private dan menolak publish (kecuali kamu punya paid plan).

## Step 7: Verifikasi di npm

Setelah publish, cek halaman npm:

- https://www.npmjs.com/package/@syncraft-labs/core
- https://www.npmjs.com/package/@syncraft-labs/react
- https://www.npmjs.com/package/@syncraft-labs/vue

Coba install di project lain untuk memastikan:

```bash
npm install @syncraft-labs/core @syncraft-labs/react
```

---

## Versioning (Semver)

Syncraft Labs mengikuti [Semantic Versioning](https://semver.org/):

| Change                            | Version Bump      | Command             |
| --------------------------------- | ----------------- | ------------------- |
| Bug fix, patch                    | `0.1.0` ΓåÆ `0.1.1` | `npm version patch` |
| New feature (backward-compatible) | `0.1.0` ΓåÆ `0.2.0` | `npm version minor` |
| Breaking change                   | `0.x.x` ΓåÆ `1.0.0` | `npm version major` |

### Update Version di Semua Packages

Karena monorepo, update versi di semua packages sekaligus:

```bash
# Dari masing-masing package directory
cd packages/core && npm version patch
cd ../react && npm version patch
cd ../vue && npm version patch
```

> [!TIP]
> Untuk otomatisasi versioning di monorepo, pertimbangkan tools seperti:
>
> - [Changesets](https://github.com/changesets/changesets) ΓÇö paling populer untuk monorepo
> - [Lerna](https://lerna.js.org/) ΓÇö mature, banyak fitur

---

## CI/CD: Automated Publishing (Optional)

### GitHub Actions

Buat `.github/workflows/publish.yml`:

```yaml
name: Publish to npm

on:
  release:
    types: [created]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          registry-url: "https://registry.npmjs.org"

      - run: npm ci
      - run: npm run build
      - run: npm run test

      # Publish setiap package
      - run: cd packages/core && npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - run: cd packages/react && npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - run: cd packages/vue && npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Setup npm Token

1. Buka [npmjs.com](https://www.npmjs.com/) ΓåÆ Avatar ΓåÆ **Access Tokens**
2. **Generate New Token** ΓåÆ pilih **Automation** (untuk CI/CD)
3. Copy token
4. Di GitHub repo ΓåÆ **Settings** ΓåÆ **Secrets and variables** ΓåÆ **Actions**
5. Tambah secret: Name = `NPM_TOKEN`, Value = token dari step 3

---

## Troubleshooting

### "You must sign up for private packages"

```
npm ERR! 402 Payment Required
```

**Solusi:** Tambahkan `--access public` saat publish. Scoped packages default-nya private.

### "Package name already exists"

```
npm ERR! 403 Forbidden - Package name too similar to existing package
```

**Solusi:** Ganti nama organization atau gunakan scope yang berbeda.

### "You do not have permission to publish"

```
npm ERR! 403 Forbidden
```

**Solusi:**

- Pastikan sudah `npm login`
- Pastikan akun kamu adalah member dari org `@syncraft-labs`
- Pastikan belum ada orang lain yang own package ini

### Version sudah ada

```
npm ERR! 403 - You cannot publish over the previously published version
```

**Solusi:** Bump version dulu sebelum publish:

```bash
npm version patch  # atau minor/major
```
