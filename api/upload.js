// 使用 require 导入，在 Vercel 环境下对 tencentcloud-sdk-nodejs 更稳定
const tencentcloud = require("tencentcloud-sdk-nodejs");

const StsClient = tencentcloud.sts.v20180813.Client;

// 后端配置，使用Vercel的环境变量
const clientConfig = {
  credential: {
    secretId: process.env.TENCENT_SECRET_ID,
    secretKey: process.env.TENCENT_SECRET_KEY,
  },
  region: process.env.COS_REGION, 
  profile: {
    httpProfile: {
      endpoint: 'sts.tencentcloudapi.com',
    },
  },
};

// Vercel Serverless Function 不需要显式导入 req 和 res 的类型
module.exports = async (req, res) => {
  // 只允许 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Vercel 已经帮我们解析了 JSON body
  const { fileName } = req.body;
  if (!fileName) {
    return res.status(400).json({ error: 'fileName is required' });
  }

  const Bucket = process.env.COS_BUCKET;
  const Region = process.env.COS_REGION;
  const AppId = Bucket.split('-').pop(); 

  const policy = {
    version: '2.0',
    statement: [
      {
        effect: 'allow',
        action: ['cos:PutObject'],
        resource: [
          `qcs::cos:${Region}:uid/${AppId}:${Bucket}/uploads/${fileName}`,
        ],
      },
    ],
  };

  const client = new StsClient(clientConfig);
  const params = {
    Name: 'cos-upload-permission',
    Policy: JSON.stringify(policy),
    DurationSeconds: 1800,
  };

  try {
    const data = await client.GetFederationToken(params);
    res.status(200).json({
      credentials: data.Credentials,
      expiredTime: data.ExpiredTime,
    });
  } catch (err) {
    console.error('Error getting federation token:', err);
    res.status(500).json({ error: '获取临时凭证失败', details: err.toString() });
  }
};