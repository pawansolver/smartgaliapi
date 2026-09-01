# Event Module Documentation (Logic & Flow)

Yeh document SmartGali application ke **"Event Management"** module ka detailed logic aur flow explain karta hai. Is module me mainly 3 cheezein hain: Event Categories, Events, aur Event Participants (RSVPs).

---

## 1. Event Categories Logic
**Purpose:** Har event ko properly classify karne ke liye event categories (e.g. Festival, Health, Yoga, Celebration) zaruri hain.

### Backend Details:
- **Table Name:** `event_categories`
- **Fields:** `id`, `name`, `icon` (image path), `is_active`, `is_deleted`, `created_by` (Foreign key to `users`).
- **Flow:**
  - `POST /api/v1/event-category`: Frontend se naam aur file (`icon`) aati hai. Hum Multer middleware use karke `icon` save karte hain, uske baad database me category entry create hoti hai.
  - `GET /api/v1/event-category`: Saari active/non-deleted categories milti hain.

### Frontend Admin Panel (`/events/categories`):
- Ek page jahan Admin saari categories ko list me dekh sakta hai.
- Ek "+ Add Category" button se modal khulta hai, jahan image preview ke sath category banayi/edit ki ja sakti hai.

---

## 2. Events Logic
**Purpose:** Platform par naye events create karna, unki updates handle karna aur complete information (title, date, location) manage karna.

### Backend Details:
- **Table Name:** `events`
- **Fields:** 
  - `id`, `title`, `description`, `location`, `latitude`, `longitude`
  - `start_at`, `end_at` (Event Dates)
  - `event_type` (online / offline / hybrid)
  - `cover_image` (Event ki main image)
  - `category_id` (Foreign Key -> `event_categories`)
  - `created_by` (Foreign Key -> `users`)
  - `community_id` (Foreign Key -> `communities`)
- **Flow:**
  - `POST /api/v1/event`: Multer use karke form data process kiya jata hai (jisme category_id aur type wagera included hote hain) aur database me ek naya event banta hai.
  - `GET /api/v1/event`: Events ki array wapas karta hai jisme `category` aur `creator` (User) ka relation include kiya gaya hota hai.

### Frontend Admin Panel (`/events`):
- Ek responsive table jahan saare existing Events show hote hain.
- Ek single unified **"Add New Event"** modal banaya gaya hai jisme:
  - Event Title, Event Type, Start/End time.
  - Dropdown jisme **Event Category API** se live categories aati hain (SearchableDropdown).
  - Cover Image upload mechanism.

---

## 3. Event Participants (RSVP) Logic
**Purpose:** Event attend karne waale users (Going, Interested, Declined) ko manage aur track karna.

### Backend Details:
- **Table Name:** `event_participants`
- **Fields:** `id`, `event_id`, `user_id`, `status` ('going', 'interested', 'invited', 'declined').
- **Flow:**
  - Jab ek resident mobile app se kisi event par "Going" click karta hai, tab `POST /api/v1/event-participant` API hit hoti hai.
  - API user ki ID, Event ki ID aur selected status ko table me store karti hai.
  - `GET /api/v1/event-participant` se sabhi events ke participants ka combined data milta hai taaki unhe admin dekh sake.

### Frontend Admin Panel (`/events/rsvp`):
- Yeh page completely "View-Only" format par based hai kyunki Admin directly RSVPs create nahi karta.
- Yahan top-right me ek **Dropdown Filter** diya gaya hai taaki admin kis particular Event (e.g. "Diwali Mela") ko select karke sirf wahi ke RSVPs dekh sake.
- Table me user ki photo, naam, email, us event ka naam aur RSVP status ek tag ("going" (green), "interested" (blue)) me dikhata hai.
- Admin fake ya galat RSVP ko Trash icon press karke soft delete kar sakta hai.

---

## 4. File Architecture (Separation of Concerns)
Code ko maintainable rakhne ke liye frontend ko strict architecture me baanta gaya hai:

### Backend (`smartgaliAPI/src/modules/`)
- `event/`: Model, Controller, Service, Routes
- `event_category/`: Model, Controller, Service, Routes
- `event_participant/`: Model, Controller, Service, Routes

### Frontend (`smartGaliAdmin/smartgaliadmin/`)
- **`types/`**: (`event.ts`, `eventCategory.ts`, `eventParticipant.ts`) -> TypeScript ke pure interfaces aur database shape.
- **`services/`**: (`eventService.ts`, `eventCategoryService.ts`, `eventParticipantService.ts`) -> Yeh files `apiClient` use karke sirf API interaction (GET, POST, PUT, DELETE) handle karti hain aur unhe data provide karti hain.
- **`app/events/`**: -> UI Pages jo sirf services aur components ko call karke data display aur forms present karti hain.
