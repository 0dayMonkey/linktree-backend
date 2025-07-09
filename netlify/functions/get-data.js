const { Client } = require("@notionhq/client");
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const headers = {
  'Access-Control-Allow-Origin': 'https://harib-naim.fr',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const getPlainText = (property) => property?.rich_text?.[0]?.plain_text || "";
const getTitle = (property) => property?.title?.[0]?.plain_text || "";
const getSelect = (property) => property?.select?.name || null;
const getNumber = (property) => property?.number || 0;
const getUrl = (property) => {
    if (property?.url) {
        return property.url;
    }
    if (property?.files?.[0]?.file?.url) {
        return property.files[0].file.url;
    }
     if (property?.files?.[0]?.external?.url) {
        return property.files[0].external.url;
    }
    return "";
};

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    const [profileDb, socialsDb, linksDb] = await Promise.all([
      notion.databases.query({ database_id: process.env.NOTION_PROFILE_DB_ID }),
      notion.databases.query({ database_id: process.env.NOTION_SOCIALS_DB_ID }),
      notion.databases.query({ database_id: process.env.NOTION_LINKS_DB_ID }),
    ]);

    if (profileDb.results.length === 0) {
      throw new Error("The 'Profile & Appearance' database in Notion is empty. Please add one row.");
    }
    const profileProps = profileDb.results[0].properties;
    
    const formattedData = {
      profilePageId: profileDb.results[0].id,
      profile: {
        title: getPlainText(profileProps.profile_title),
        pictureUrl: getUrl(profileProps.picture_url),
      },
      appearance: {
        fontFamily: getPlainText(profileProps.font_family) || "'Inter', sans-serif",
        textColor: getPlainText(profileProps.text_color) || "#000000",
        background: {
          type: getSelect(profileProps.background_type) || "solid",
          value: getPlainText(profileProps.background_value) || "#FFFFFF",
        },
        button: {
          backgroundColor: getPlainText(profileProps.button_bg_color) || "#FFFFFF",
          textColor: getPlainText(profileProps.button_text_color) || "#000000",
          borderRadius: '8px',
          hasShadow: true
        }
      },
      seo: { 
        title: getPlainText(profileProps.seo_title), 
        description: getPlainText(profileProps.seo_description), 
        faviconUrl: getUrl(profileProps.seo_faviconUrl) 
      },
      socials: socialsDb.results.map(item => ({
        pageId: item.id,
        id: getNumber(item.properties.id),
        network: getTitle(item.properties.Network),
        url: getUrl(item.properties.URL),
        order: getNumber(item.properties.Order)
      })).sort((a, b) => a.order - b.order),
      links: linksDb.results.map(item => ({
        pageId: item.id,
        id: getNumber(item.properties.id),
        type: getSelect(item.properties.type),
        title: getTitle(item.properties.Title),
        url: getUrl(item.properties.URL),
        thumbnailUrl: getUrl(item.properties['Thumbnail URL']),
        order: getNumber(item.properties.Order)
      })).sort((a, b) => a.order - b.order),
    };

    return {
      statusCode: 200,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(formattedData),
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || "Failed to fetch data from Notion." }),
    };
  }
};