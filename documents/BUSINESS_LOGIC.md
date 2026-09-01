# Business Management - Logic & Features Guide

Ye document un sabhi business-related features ka step-by-step simple summary hai jo ab tak admin panel aur backend me banaye gaye hain.

## 1. Business Categories (`/businesses/categories`)
Ye section business ki categories (jaise Grocery, Electronics, etc.) manage karne ke liye hai.
* **Logic:** 
  * Admin naye categories add kar sakta hai, edit kar sakta hai aur delete kar sakta hai.
  * **Image Upload:** Jab admin icon/image upload karta hai, toh frontend se `FormData` backend ko bheja jata hai. 
  * Backend ka `uploadImage` middleware photo ko server ke `/uploads/businessCategory` folder me save karta hai. Fir `getImageUrl` utility function ek HTTP link generate karta hai jo MySQL database me save hota hai.
  * **UI:** Yahan modern *floating labels* aur *error validation* (red border if empty) ka use kiya gaya hai. Delete karne se pehle ek black *Delete Confirmation Modal* khulta hai.

## 2. Business Listings (`/businesses`)
Ye section system me mojud sabhi businesses ki list dikhata hai.
* **Logic:**
  * **Add Business:** Admin panel me "Add Business" ka option add kiya gaya hai (Plus icon with black hover tooltip).
  * Normally users app se business add karte hain jo 'Unverified' hote hain, lekin jab Admin panel se koi business add kiya jata hai toh wo directly `is_verified: true` ke sath database me jata hai (yani turant verify ho jata hai).
  * Yahan bhi Logo upload karne ke liye wahi `FormData` aur `getImageUrl` wala secure logic use ho raha hai (`/uploads/business` me image jati hai).
  * **Category Selection:** Yahan native select ki jagah ek custom `SearchableDropdown` UI component lagaya gaya hai jisse easily type karke category dhoondi ja sake.

## 3. Featured Businesses (`/businesses/featured`)
Ye section un businesses ko manage karta hai jinhe admin app me "Top" par ya "Promoted" dikhana chahta hai.
* **Logic:**
  * Is page par sirf ek hi table hai jiske 2 view (mode) hain.
  * **Default View:** Sirf wahi businesses dikhte hain jinme database flag `is_featured: true` hai.
  * **Add Mode:** Jab admin top-right icon pe click karta hai, tab table un sabhi businesses ko dikhane lagta hai jo *Verified* hain. 
  * **Action (Star Icon):** Kisi bhi normal business ke aage wale Star(⭐) icon par click karne se backend API hit hoti hai jo us business ko "Featured" bana deti hai. Agar kisi ko hatana ho toh featured list se wahi star icon wapas click karke use unfeature kiya ja sakta hai.

## 4. Business Reviews (`/businesses/reviews`)
Ye page app users dwara businesses par diye gaye reviews (ratings & comments) ko monitor karne ke liye hai.
* **Logic:**
  * Admin sabhi reviews dekh sakta hai (kitni star rating di, kya comment likha, kisne likha aur kis business ke liye).
  * Agar koi review kharab (inappropriate) hai, toh admin use delete kar sakta hai. 
  * Delete karte waqt permanently data udne ke bajaye backend database me `is_deleted: true` mark hota hai, aur `deletedRemarks` me "Deleted by Admin" likh diya jata hai taaki log maintain rahe.

## 5. Clean Code Architecture
* **Interface Separation:** Code ko clean rakhne ke liye TypeScript ke `interface` (jaise `BusinessCategory` aur `BusinessReview`) ko unki Services se alag karke `types/` folder me move kiya gaya hai. Bilkul jaise Community section ko setup kiya gaya tha. Isse codebase organized rehta hai.
