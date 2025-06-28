import { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import FormData from 'form-data';
import multer from 'multer';
import { Readable } from 'stream';

// Configure multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

export default async function handler(request, response) {
    upload.single('image')(request, response, async (err) => {
        if (err) {
            console.error('Multer error:', err);
            return response.status(500).json({ error: 'File upload error', details: err.message });
        }

        if (!request.file) {
            return response.status(400).json({ error: 'No file uploaded.' });
        }

        const { originalname, buffer, mimetype } = request.file;
        const uploaderName = (request.body.uploaderName || '匿名用户').replace(/\s/g, '_');
        const imageDescription = (request.body.imageDescription || '无描述').replace(/\s/g, '_');

        const tenantId = process.env.ONEDRIVE_TENANT_ID;
        const clientId = process.env.ONEDRIVE_CLIENT_ID;
        const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET;
        const refreshToken = process.env.ONEDRIVE_REFRESH_TOKEN;
        const redirectUri = process.env.ONEDRIVE_REDIRECT_URI || 'https://vercel.com';
        const scope = 'Files.ReadWrite.All offline_access';
        const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

        if (!tenantId || !clientId || !clientSecret || !refreshToken) {
            return response.status(500).json({ error: 'Missing OneDrive API configuration environment variables.' });
        }

        let accessToken;
        try {
            const params = new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                redirect_uri: redirectUri,
                scope: scope,
            });

            const tokenResponse = await axios.post(tokenEndpoint, params.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            });

            accessToken = tokenResponse.data.access_token;
        } catch (tokenError) {
            console.error('Error getting access token:', tokenError.response ? tokenError.response.data : tokenError.message);
            return response.status(500).json({ error: 'Failed to obtain OneDrive access token.' });
        }

        const timestamp = new Date().toISOString().replace(/[:.-]/g, '');
        const fileExtension = originalname.split('.').pop();
        const fileName = `${timestamp}_${uploaderName}_${imageDescription}.${fileExtension}`;
        const uploadPath = `/8ban_uploads/${fileName}`;
        const uploadUrl = `https://graph.microsoft.com/v1.0/me/drive/root:${encodeURIComponent(uploadPath)}:/content`;

        try {
            const uploadResponse = await axios.put(uploadUrl, buffer, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': mimetype,
                    'Content-Length': buffer.length,
                },
            });

            response.status(200).json({
                message: 'File uploaded successfully!',
                fileName: uploadResponse.data.name,
                fileUrl: uploadResponse.data.webUrl,
            });
        } catch (uploadError) {
            console.error('OneDrive upload error:', uploadError.response ? uploadError.response.data : uploadError.message);
            response.status(500).json({
                error: 'Failed to upload file to OneDrive.',
                details: uploadError.response ? uploadError.response.data : uploadError.message,
            });
        }
    });
}
