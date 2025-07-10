const { Client } = require("@notionhq/client");
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const headers = {
  'Access-Control-Allow-Origin': '*', 
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Fonction pour diviser une chaîne en morceaux de 2000 caractères max
const toChunkedRichText = (content) => {
    if (content === null || content === undefined) return [];
    const strContent = String(content);
    const maxLength = 2000;
    const chunks = [];
    for (let i = 0; i < strContent.length; i += maxLength) {
        chunks.push({ text: { content: strContent.substring(i, i + maxLength) } });
    }
    return chunks;
};

// NOUVELLE FONCTION : Divise une valeur sur plusieurs propriétés Notion
const assignSplitProperty = (properties, baseName, value, numParts = 3) => {
    const totalLength = value ? value.length : 0;
    const partLength = Math.ceil(totalLength / numParts);

    for (let i = 0; i < numParts; i++) {
        const propName = i === 0 ? baseName : `${baseName}_comp${i}`;
        const start = i * partLength;
        const end = start + partLength;
        const partValue = value ? value.substring(start, end) : "";
        
        // Important: Toujours assigner la propriété pour effacer les anciennes données
        properties[propName] = { rich_text: toChunkedRichText(partValue) };
    }
};

const toTitle = (content) => [{ text: { content: content || "" } }];

const isValidImageUrl = (url) => {
    if (!url) return null;
    const sUrl = String(url);
    return (sUrl.startsWith('http') || sUrl.startsWith('data:image')) ? sUrl : null;
};

const updateProfilePage = (pageId, data) => {
    if (!pageId) throw new Error("L'ID de la page de profil est manquant.");
    const { profile, appearance, seo } = data;

    let properties = {
        'profile_title': { rich_text: toChunkedRichText(profile.title) },
        'profile_description': { rich_text: toChunkedRichText(profile.description) },
        'font_family': { rich_text: toChunkedRichText(appearance.fontFamily) },
        'text_color': { rich_text: toChunkedRichText(appearance.textColor) },
        'profile_title_color': { rich_text: toChunkedRichText(appearance.titleColor) },
        'profile_description_color': { rich_text: toChunkedRichText(appearance.descriptionColor) },
        'background_type': { select: { name: appearance.background.type || "solid" } },
        'link_bg_color': { rich_text: toChunkedRichText(appearance.link.backgroundColor) },
        'link_text_color': { rich_text: toChunkedRichText(appearance.link.textColor) },
        'link_border_radius': { rich_text: toChunkedRichText(appearance.link.borderRadius) },
        'link_border_width': { rich_text: toChunkedRichText(appearance.link.borderWidth) },
        'link_border_color': { rich_text: toChunkedRichText(appearance.link.borderColor) },
        'header_bg_color': { rich_text: toChunkedRichText(appearance.header.backgroundColor) },
        'header_text_color': { rich_text: toChunkedRichText(appearance.header.textColor) },
        'header_border_radius': { rich_text: toChunkedRichText(appearance.header.borderRadius) },
        'header_border_width': { rich_text: toChunkedRichText(appearance.header.borderWidth) },
        'header_border_color': { rich_text: toChunkedRichText(appearance.header.borderColor) },
        'seo_title': { rich_text: toChunkedRichText(seo.title) },
        'seo_description': { rich_text: toChunkedRichText(seo.description) },
        'picture_layout': { select: { name: appearance.pictureLayout || "circle" } },
    };
    
    // Appliquer la logique de division pour les images
    assignSplitProperty(properties, 'picture_url', isValidImageUrl(profile.pictureUrl));
    assignSplitProperty(properties, 'seo_faviconUrl', isValidImageUrl(seo.faviconUrl));

    if (appearance.background.type === 'image') {
        assignSplitProperty(properties, 'background_value', isValidImageUrl(appearance.background.value));
    } else {
        properties['background_value'] = { rich_text: toChunkedRichText(appearance.background.value) };
        assignSplitProperty(properties, 'background_value', null, 2); // Effacer les champs comp
    }

    return notion.pages.update({ page_id: pageId, properties });
};

const syncItems = async (dbId, items, existingPages, isSocial = false) => {
    const operations = [];
    const adminItemIds = new Set(items.map(i => i.id));
    
    for (const [index, item] of items.entries()) {
        let properties = { 'id': { number: item.id }, 'Order': { number: index } };
        
        if (isSocial) {
            properties.Network = { title: toTitle(item.network) };
            properties.URL = { url: item.url || null };
        } else {
            properties.Title = { title: toTitle(item.title) };
            properties.type = { select: { name: item.type || "link" } };
            properties.URL = { url: item.url || null };
            // Appliquer la logique de division pour les miniatures
            assignSplitProperty(properties, 'Thumbnail URL', isValidImageUrl(item.thumbnailUrl));
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
    
    await Promise.all(operations);
};

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Méthode non autorisée' };

  try {
    if (!event.body) throw new Error("Le corps de la requête est vide.");
    const { secret, data } = JSON.parse(event.body);
    if (secret !== process.env.UPDATE_SECRET_KEY) return { statusCode: 401, headers, body: 'Non autorisé' };
    if (!data) throw new Error("L'objet de données est manquant.");

    const [existingLinks, existingSocials] = await Promise.all([
        notion.databases.query({ database_id: process.env.NOTION_LINKS_DB_ID }),
        notion.databases.query({ database_id: process.env.NOTION_SOCIALS_DB_ID })
    ]);

    await Promise.all([
        updateProfilePage(data.profilePageId, data),
        syncItems(process.env.NOTION_LINKS_DB_ID, data.links || [], existingLinks.results, false),
        syncItems(process.env.NOTION_SOCIALS_DB_ID, data.socials || [], existingSocials.results, true)
    ]);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Mise à jour réussie' })
    };
  } catch (error) {
    console.error("Error in update-data:", error);
    return {
      statusCode: error.status || 500,
      headers,
      body: JSON.stringify({ message: error.message, code: error.code }),
    };
  }
};