export const config = {
    api: {
        bodyParser: false,
    },
};

import { VercelRequest, VercelResponse } from '@vercel/node';
import tencentcloud from 'tencentcloud-sdk-nodejs';

const StsClient = tencentcloud.sts.v20180813.Client;

// 后端配置，使用Vercel的环境变量
const clientConfig = {
  credential: {
    secretId: process.env.TENCENT_SECRET_ID,
    secretKey: process.env.TENCENT_SECRET_KEY,
  },
  region: '', // STS服务是全局的，不需要特定地域
  profile: {
    httpProfile: {
      endpoint: 'sts.tencentcloudapi.com',
    },
  },
};

export default async function handler(req, res) {
  // 只允许 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 从前端请求中获取将要上传的文件名
  const { fileName } = req.body;
  if (!fileName) {
    return res.status(400).json({ error: 'fileName is required' });
  }

  const Bucket = process.env.COS_BUCKET;
  const Region = process.env.COS_REGION;
  const AppId = Bucket.split('-').pop(); // 从Bucket名称中自动提取AppId

  // --- 权限策略 ---
  // 这里定义了临时密钥的权限。
  const policy = {
    version: '2.0',
    statement: [
      {
        effect: 'allow', // 允许操作
        action: [
          'cos:PutObject', // 只允许执行“上传对象”这一个操作
        ],
        resource: [
          `qcs::cos:${Region}:uid/${AppId}:${Bucket}/uploads/${fileName}`,
        ],
      },
    ],
  };

  const client = new StsClient(clientConfig);
  const params = {
    Name: 'cos-upload-permission', // 随便起个名字
    Policy: JSON.stringify(policy), // 把上面的策略转成字符串
    DurationSeconds: 1800, // 临时密钥有效期30分钟，足够上传了
  };

  try {
    // 调用腾讯云API获取临时密钥
    const data = await client.GetFederationToken(params);
    // 成功后，将临时密钥返回给前端
    res.status(200).json({
      credentials: data.Credentials,
      expiredTime: data.ExpiredTime,
    });
  } catch (err) {
    console.error('Error getting federation token:', err);
    res.status(500).json({ error: '获取临时凭证失败', details: err.toString() });
  }
}