# Image Upload & AWS S3 Migration Guide

This document explains how our image upload system works and provides a step-by-step guide on how to migrate the local storage to **AWS S3** in the future.

---

## 1. How the Current Upload System Works

We have built a robust, centralized image upload utility located at `src/utils/fileUpload.js`. It is designed to be highly modular so you don't have to change your application's logic when switching to a cloud provider.

### The Two Main Functions:
1. **`uploadImage(folderName)`**: A middleware used in your routes to handle the actual file parsing. It dynamically creates sub-folders (like `uploads/user/` or `uploads/community/`) to keep everything organized.
2. **`getImageUrl(req, file, folderName)`**: A helper function used in your controllers. It generates the final public URL for the uploaded image which gets saved to the database.

### Example Usage:

**In your Route (`.routes.js`)**:
```javascript
import { uploadImage } from '../../utils/fileUpload.js';

// We pass 'user' to save files inside the 'uploads/user' directory
router.post('/', uploadImage('user').single('profile_image'), userController.createUser);
```

**In your Controller (`.controller.js`)**:
```javascript
import { getImageUrl } from '../../utils/fileUpload.js';

export const createUser = async (req, res, next) => {
  const userData = { ...req.body };
  
  if (req.file) {
    // We use the helper to get the proper URL. No manual path formatting needed!
    userData.profile_image = getImageUrl(req, req.file, 'user');
  }
  
  // ... save to DB
};
```

---

## 2. Steps to Migrate to AWS S3

When you are ready to scale and move your media to AWS S3, you only need to modify **one file**: `src/utils/fileUpload.js`. You will **not** need to touch any routes or controllers.

### Step 1: Install Required AWS Packages
Run the following command in your terminal to install the AWS SDK and Multer S3 storage engine:
```bash
npm install aws-sdk multer-s3
```

### Step 2: Set up AWS Credentials in `.env`
Add your AWS bucket details to your `.env` file:
```env
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=your_aws_region
AWS_BUCKET_NAME=your_bucket_name
```

### Step 3: Update `src/utils/fileUpload.js`
Replace the contents of `src/utils/fileUpload.js` with the AWS S3 setup:

```javascript
import multer from 'multer';
import multerS3 from 'multer-s3';
import AWS from 'aws-sdk';
import path from 'path';

// 1. Configure AWS SDK
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const s3 = new AWS.S3();

// 2. Update the upload middleware to use multer-s3
export const uploadImage = (folderName = 'general') => {
  const storage = multerS3({
    s3: s3,
    bucket: process.env.AWS_BUCKET_NAME,
    acl: 'public-read', // Makes the uploaded image publicly accessible
    metadata: function (req, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key: function (req, file, cb) {
      // Save it inside the dynamic folder on the S3 bucket
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      cb(null, `${folderName}/${file.fieldname}-${uniqueSuffix}${ext}`);
    }
  });

  const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  };

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }
  });
};

// 3. Update the URL generator
export const getImageUrl = (req, file, folderName = 'general') => {
  if (!file) return null;
  // Multer S3 automatically injects the public URL into file.location
  return file.location; 
};
```

### Conclusion
By following this guide, your entire application will instantly switch to saving images on AWS S3, and the database will automatically start storing the new AWS S3 URLs. None of your `controller.js` or `routes.js` files will break!
