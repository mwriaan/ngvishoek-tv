# NG Kerk Vishoek — Smart TV App

Afrikaans HTML5 web-app vir Samsung (Tizen) en LG (webOS) slim-televisies.

## Skerms

| Seksie | Beskrywing |
|--------|------------|
| **Regstreekse Uitsending** | YouTube regstreekse kanaal — outomaties aktief by stapel |
| **Ons Musiek** | YouTube musiek-snitlys `PLwcD6UKAo4VLCeJ8JBRHZbJbOadgAatiA` |
| **Vorige Preke** | YouTube preek-snitlys `PL3ZCv-_chxKcez82Pxe3YEgqM2vlalQYK` |
| **Kontak Ons** | Adres, telefoon, e-pos en 'n QR-kode na www.ngvishoek.co.za |
| **Dankoffer** | SnapScan QR-kode + stap-vir-stap instruksies |

## Navigasie (afstandbeheerder)

| Knoppie | Aksie |
|---------|-------|
| ↑ / ↓   | Beweeg tussen kieslys-items |
| ↵ / →   | Kies die gemerkte item / gaan na inhoud |
| ←       | Terug na kieslys |
| BACK    | Terug na kieslys, of verlaat die app |
| 1 – 5   | Springkortpad na seksie 1–5 |

## SnapScan QR-kode byvoeg

Die app wys 'n plekhouer as `images/snapscan-qr.png` ontbreek.

1. Meld aan by jou SnapScan handelaarsrekening.
2. Laai jou unieke QR-kode-prent af.
3. Stoor dit as **`images/snapscan-qr.png`** in hierdie gids.
4. Herbou / herlaai die app.

## Platforms

### Samsung Tizen (Smart TVs)

Vereis **Tizen IDE** of **Samsung Smart TV SDK**.

```bash
# Pak die app
tizen package -t wgt -s <signing-profile> -- .

# Installeer op TV (TV moet in developer-modus wees)
tizen install -n NGVishoekTV.wgt -t <TV-serial>
```

Stuur vir verdeling via [Samsung Seller Office](https://seller.samsungapps.com).

### LG webOS

Vereis **webOS SDK** (`ares-cli`).

```bash
# Pak
ares-package .

# Installeer
ares-install --device <TV> co.za.ngvishoek.tv_1.0.0_all.ipk
```

### Toets in 'n blaaier

```bash
# Enige statiese bediener werk — byvoorbeeld:
npx serve .
# Dan besoek http://localhost:3000 in Chrome (stel venster op 1920×1080)
```

## Lêerstruktuur

```
ngvishoek-tv/
├── index.html          # Hoof-app-skelet
├── css/
│   └── tv.css          # TV-geoptimiseerde donker tema
├── js/
│   ├── nav.js          # D-pad / afstandbeheerder navigasie
│   └── app.js          # Seksie-skakel, klok, regstreeks-status
├── images/
│   ├── snapscan-qr.png     ← VOEG JOU QR-KODE HIER BY
│   ├── snapscan-logo.jpg   (reeds ingesluit)
│   ├── icon-117.png        ← Tizen ikoon (117×117 PNG)
│   ├── icon-80.png         ← webOS ikoon (80×80 PNG)
│   └── icon-130.png        ← webOS groot ikoon (130×130 PNG)
├── webos/
│   └── appinfo.json    # LG webOS manifes
├── config.xml          # Samsung Tizen manifes
└── README.md
```

## Handelsmerk

- **Primêre kleur:** `#C47D1A` (goue bruin)
- **Agtergrond:** `#0D0804` (warm donker)
- **Teks:** `#F7F1EA` (warm wit)
- **Lettertipes:** Playfair Display (opskrifte) · Inter (liggaam)
