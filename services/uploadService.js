const fs = require('fs');
const path = require('path');
const axios = require('axios');

const BUNNY_CONFIG = {
  storageZone: process.env.BUNNY_STORAGE_ZONE || process.env.BUNNY_USERNAME || 'cly-bunny',
  password: process.env.BUNNY_PASSWORD || '22cfd8b3-8021-40a3-b100a9d48bc0-7dc3-4654',
  host: process.env.BUNNY_HOST || 'storage.bunnycdn.com',
  pullUrl: process.env.BUNNY_PULL_URL || 'https://cly-pull-bunny.b-cdn.net',
};

// Local backup directory
const localUploadsDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(localUploadsDir)) {
  fs.mkdirSync(localUploadsDir, { recursive: true });
}

/**
 * Upload single image to Bunny.net Edge Storage HTTP API
 * Spec: PUT https://{host}/{storageZoneName}/{path}/{fileName}
 * Headers: AccessKey: {password}, Content-Type: application/octet-stream
 * Body: Raw binary buffer (no encoding)
 */
async function uploadImage(file, folder = 'gm') {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 10);
  const fileExtension = file.originalname ? file.originalname.split('.').pop() : 'jpg';
  const fileName = `${timestamp}_${randomString}.${fileExtension}`;
  const remotePath = `/${folder}/${fileName}`;

  // Public URL is ALWAYS the BunnyCDN pull URL so frontend never relies on backend availability
  const publicUrl = `${BUNNY_CONFIG.pullUrl}${remotePath}`;

  // 1. Upload to Bunny.net HTTP API
  try {
    const uploadUrl = `https://${BUNNY_CONFIG.host}/${BUNNY_CONFIG.storageZone}/${folder}/${fileName}`;

    const response = await axios.put(uploadUrl, file.buffer, {
      headers: {
        'AccessKey': BUNNY_CONFIG.password,
        'Content-Type': 'application/octet-stream',
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 15000,
    });

    if (response.status === 201 || response.status === 200) {
      console.log(`Successfully uploaded to Bunny.net: ${publicUrl} (status: ${response.status})`);
    } else {
      console.warn(`Bunny.net unexpected response status: ${response.status}`);
    }
  } catch (bunnyError) {
    console.error(`Bunny.net upload error:`, bunnyError.response?.status, bunnyError.response?.data || bunnyError.message);
  }

  // 2. Save local backup file
  try {
    const filePath = path.join(localUploadsDir, fileName);
    fs.writeFileSync(filePath, file.buffer);
  } catch (localError) {
    console.warn('Backup write error:', localError.message);
  }

  // Return the public BunnyCDN pull URL
  return {
    success: true,
    url: publicUrl,
    fileName: fileName,
    originalName: file.originalname,
  };
}

/**
 * Upload multiple images
 */
async function uploadMultipleImages(files, folder = 'gm') {
  const uploadPromises = files.map((file) => uploadImage(file, folder));
  try {
    const results = await Promise.all(uploadPromises);
    return {
      success: true,
      results: results,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Delete image from Bunny.net Edge Storage HTTP API
 * Spec: DELETE https://{host}/{storageZoneName}/{path}/{fileName}
 * Headers: AccessKey: {password}
 */
async function deleteImage(imageUrl) {
  try {
    const urlParts = imageUrl.split(BUNNY_CONFIG.pullUrl);
    if (urlParts.length >= 2) {
      const filePath = urlParts[1]; // e.g. /gm/fileName
      const deleteUrl = `https://${BUNNY_CONFIG.host}/${BUNNY_CONFIG.storageZone}${filePath}`;
      await axios.delete(deleteUrl, {
        headers: {
          'AccessKey': BUNNY_CONFIG.password,
        },
        timeout: 10000,
      });
      console.log(`Deleted from Bunny.net: ${deleteUrl}`);
    }
    return { success: true };
  } catch (error) {
    console.error('Delete error:', error.response?.status, error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  uploadImage,
  uploadMultipleImages,
  deleteImage,
  BUNNY_CONFIG,
};
