import { ImageResponse } from '@vercel/og';

interface OGImageInput {
  displayName: string;
  provider: string;
  highlights: Array<{ label: string; value: string }>;
}

export async function generateOGImage(input: OGImageInput): Promise<Buffer> {
  const response = new ImageResponse(
    {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          backgroundColor: '#f8fafc',
          padding: '60px',
          fontFamily: 'system-ui, sans-serif',
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
              },
              children: [
                {
                  type: 'p',
                  props: {
                    style: {
                      fontSize: '24px',
                      color: '#64748b',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                    },
                    children: input.provider,
                  },
                },
                {
                  type: 'h1',
                  props: {
                    style: {
                      fontSize: '64px',
                      fontWeight: 'bold',
                      color: '#0f172a',
                      marginTop: '8px',
                    },
                    children: input.displayName,
                  },
                },
              ],
            },
          },
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                gap: '32px',
              },
              children: input.highlights.slice(0, 3).map((hl) => ({
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: '#ffffff',
                    borderRadius: '16px',
                    padding: '24px',
                    flex: 1,
                  },
                  children: [
                    {
                      type: 'p',
                      props: {
                        style: { fontSize: '16px', color: '#64748b' },
                        children: hl.label,
                      },
                    },
                    {
                      type: 'p',
                      props: {
                        style: {
                          fontSize: '36px',
                          fontWeight: 'bold',
                          color: '#0f172a',
                          marginTop: '4px',
                        },
                        children: hl.value,
                      },
                    },
                  ],
                },
              })),
            },
          },
          {
            type: 'p',
            props: {
              style: {
                fontSize: '18px',
                color: '#94a3b8',
                marginTop: '24px',
              },
              children: 'modelbento.com',
            },
          },
        ],
      },
    },
    { width: 1200, height: 630 },
  );

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
