const { Client } = require("@notionhq/client");
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const headers = {
  'Access-Control-Allow-Origin': 'https://harib-naim.fr',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const updateProfilePage = (pageId, data) => {
    if (!pageId) throw new Error("Profile pageId is missing.");
    const { profile, appearance, seo } = data;
    const backgroundValue = Array.isArray(appearance.background.value) 
        ? appearance.background.value.join(',') 
        : appearance.background.value;
    return notion.pages.update({
        page_id: pageId,
        properties: {
            'profile_title': { rich_text: [{ text: { content: profile.title || "" } }] },
            'picture_url': { url: profile.pictureUrl || null },
            'font_family': { rich_text: [{ text: { content: appearance.fontFamily || "" } }] },
            'text_color': { rich_text: [{ text: { content: appearance.textColor || "" } }] },
            'background_type': { select: { name: appearance.background.type || "solid" } },
            'background_value': { rich_text: [{ text: { content: backgroundValue } }] },
            'button_bg_color': { rich_text: [{ text: { content: appearance.button.backgroundColor || "" } }] },
            'button_text_color': { rich_text: [{ text: { content: appearance.button.textColor || "" } }] },
            // ÉCRITURE DES DONNÉES SEO
            'seo_title': { rich_text: [{ text: { content: seo.title || "" } }] },
            'seo_description': { rich_text: [{ text: { content: seo.description || "" } }] },
            'seo_faviconUrl': { url: seo.faviconUrl || null },
        }
    });
};

const syncItems = async (dbId, itemsFromAdmin, existingPages, isSocial = false) => {
    const operations = [];
    const adminItemIds = new Set(itemsFromAdmin.map(i => i.id));
    for (const [index, item] of itemsFromAdmin.entries()) {
        const properties = { 'id': { number: item.id }, 'Order': { number: index } };
        if (isSocial) {
            properties.Network = { title: [{ text: { content: item.network || "website" } }] };
            properties.URL = { url: item.url || null };
        } else {
            properties.Title = { title: [{ text: { content: item.title || "" } }] };
            properties.type = { select: { name: item.type || "link" } };
            properties.URL = { url: item.url || null };
            properties['Thumbnail URL'] = { url: item.thumbnailUrl || null };
        }
        const existingPage = existingPages.find(p => p.properties.id.number === item.id);
        if (existingPage) {
            operations.push(notion.pages.update({ page_id: existingPage.id, properties }));
        } else {
            operations.push(notion.pages.create({ parent: { database_id: dbId }, properties }));
        }
    }
    const pagesToDelete = existingPages.filter(p => !adminItemIds.has(p.properties.id.number));
    for (const page of pagesToDelete) {
        operations.push(notion.pages.update({ page_id: page.id, archived: true }));
    }
    return Promise.all(operations);
};

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method Not Allowed' };
  try {
    const { secret, data } = JSON.parse(event.body);
    if (secret !== process.env.UPDATE_SECRET_KEY) return { statusCode: 401, headers, body: 'Unauthorized' };
    const linksDbId = process.env.NOTION_LINKS_DB_ID;
    const socialsDbId = process.env.NOTION_SOCIALS_DB_ID;
    const [existingLinks, existingSocials] = await Promise.all([
        notion.databases.query({ database_id: linksDbId }),
        notion.databases.query({ database_id: socialsDbId })
    ]);
    await Promise.all([
        updateProfilePage(data.profilePageId, data),
        syncItems(linksDbId, data.links, existingLinks.results, false),
        syncItems(socialsDbId, data.socials, existingSocials.results, true)
    ]);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Update successful' })
    };
  } catch (error) {
    console.error("Update Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.body || error.message || "An internal server error occurred." }),
    };
  }
};