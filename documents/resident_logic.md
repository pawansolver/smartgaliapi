# Resident Management Logic

Yeh document batata hai ki humne "Residents" manage karne ka logic kis tarah banaya hai. Humara approach bohot simple aur modular hai, taaki baad mein isey asani se scale (badhaya) ja sake.

## 1. Backend Logic (smartgaliAPI)

Humne alag se koi `admin` folder nahi banaya, balki jo existing `user` module hai, usi mein changes kiye hain taaki code clean rahe.

### A. Database Query (`user.service.js`)
* **`getUsersByRole(roleName)`**: Yeh function sirf un users ko database se nikalta hai jinka role match karta hai (jaise "Resident"). 
  * Isme hum Sequelize ORM ka use karke `User` table aur `Role` table ko join (`include`) karte hain. 
  * Condition yeh lagayi hai ki `is_deleted` hamesha false hona chahiye (yani user delete na hua ho).

* **`blockUser(userId)` / `unblockUser(userId)`**: Yeh functions user ki `is_active` field ko `true` ya `false` set karte hain. Jab user block hota hai toh login ya app use nahi kar pata.

### B. Controller (`user.controller.js`)
* **`getAllUsers`**: Is function ko modify kiya gaya hai. Ab agar request mein `?roleName=Resident` likha hoga, toh yeh sirf residents ki list la kar dega, warna saare users bhej dega.
* **`blockUser` aur `unblockUser`**: APIs hit hone par yeh apne respective service functions ko call karke success ya error response bhejte hain.

### C. Routes (`user.routes.js`)
* `PUT /api/v1/user/:id/block`: User ko block karne ki API.
* `PUT /api/v1/user/:id/unblock`: User ko unblock karne ki API.
* `GET /api/v1/user`: Isi API mein hum `roleName` query bhejdete hain.

---

## 2. Frontend Logic (smartGaliAdmin)

Frontend par humne ek dedicated page banaya hai taaki Admin easily residents ko dekh aur manage kar sake.

### A. Service Layer (`userService.ts`)
* **`getUsersByRole`**: Yeh function frontend se backend API ko call karta hai `GET /api/v1/user?roleName=Resident` ke roop mein.
* **`blockUser` / `unblockUser`**: Yeh backend ki block/unblock APIs (PUT request) ko hit karte hain.

### B. Residents Page (`app/users/residents/page.tsx`)
* Humne `page.tsx` mein ek React table component use kiya hai jo sirf Resident users ko display karta hai.
* Jab page load hota hai, `useEffect` hook `userService.getUsersByRole('Resident')` call karta hai aur users ki array ko state mein save kar leta hai.
* **Block/Unblock Toggle Button**: Table ki "Status" column mein ek Toggle Switch banaya gaya hai. Jab ispe click hota hai:
  1. Frontend check karta hai ki user abhi active hai ya inactive.
  2. Agar active hai, toh `userService.blockUser(id)` API call hoti hai.
  3. API success hone par ek "Toast" message aata hai aur poora table dobara refresh ho jata hai (nayee data laane ke liye).

## Summary
In simple words: Humne existing Users table ko hi filter karke Residents ko dikhaya hai. Is approach se database mein redundancy nahi aati aur data asani se manage ho jata hai.
