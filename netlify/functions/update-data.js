const { Client } = require("@notionhq/client");

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Fonction pour archiver (supprimer) une page
const deletePage = (pageId) => notion.pages.update({ page_id: pageId, archived: true });

// Fonction pour mettre à jour la page de profil
const updateProfilePage = (pageId, data) => {
    const { profile, appearance } = data;
    return notion.pages.update({
        page_id: pageId,
        properties: {
            'profile_title': { rich_text: [{ text: { content: profile.title || "" } }] },
            'picture_url': { url: profile.pictureUrl || null },
            'font_family': { rich_text: [{ text: { content: appearance.fontFamily || "" } }] },
            'text_color': { rich_text: [{ text: { content: appearance.textColor || "" } }] },
            'background_type': { select: { name: appearance.background.type || "solid" } },
            'background_value': { rich_text: [{ text: { content: appearance.background.value.toString() } }] },
            'button_bg_color': { rich_text: [{ text: { content: appearance.button.backgroundColor || "" } }] },
            'button_text_color': { rich_text: [{ text: { content: appearance.button.textColor || "" } }] },
        }
    });
};

// Fonction pour créer une nouvelle page de lien/social
const createPage = (dbId, item, isSocial = false) => {
    let properties = {
        'id': { number: item.id },
        'Order': { number: item.order || 0 }
    };

    if (isSocial) {
        properties.Network = { title: [{ text: { content: item.network || "website" } }] };
        properties.URL = { url: item.url || null };
    } else { // C'est un lien
        properties.Title = { title: [{ text: { content: item.title || "" } }] };
        properties.Type = { select: { name: item.type || "link" } };
        properties.URL = { url: item.url || null };
        properties['Thumbnail URL'] = { url: item.thumbnailUrl || null };
    }

    return notion.pages.create({ parent: { database_id: dbId }, properties });
};


exports.handler = async function (event, context) {
    // 1. Sécurité : Vérifier la méthode et la clé secrète
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    const { secret, data } = JSON.parse(event.body);
    if (secret !== process.env.UPDATE_SECRET_KEY) {
        return { statusCode: 401, body: 'Unauthorized' };
    }

    try {
        const linksDbId = process.env.NOTION_LINKS_DB_ID;
        const socialsDbId = process.env.NOTION_SOCIALS_DB_ID;

        // 2. Mettre à jour le profil (le plus simple)
        if (data.profilePageId) {
            await updateProfilePage(data.profilePageId, data);
        }

        // 3. Synchroniser les liens et les icônes sociales
        // Stratégie : Supprimer tout et tout recréer. C'est le plus simple et le plus fiable.
        const [existingLinks, existingSocials] = await Promise.all([
            notion.databases.query({ database_id: linksDbId }),
            notion.databases.query({ database_id: socialsDbId })
        ]);

        // Supprimer toutes les anciennes pages en parallèle
        const deletions = [
            ...existingLinks.results.map(p => deletePage(p.id)),
            ...existingSocials.results.map(p => deletePage(p.id))
        ];
        await Promise.all(deletions);

        // Recréer toutes les nouvelles pages en parallèle
        const creations = [
            ...data.links.map((link, index) => createPage(linksDbId, { ...link, order: index })),
            ...data.socials.map((social, index) => createPage(socialsDbId, { ...social, order: index }, true))
        ];
        await Promise.all(creations);


        return { statusCode: 200, body: JSON.stringify({ message: 'Update successful' }) };

    } catch (error) {
        console.error("Update Error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};