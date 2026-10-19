import unittest

from publisher import LINK, PostText, build_post_text, validate_post_text


EXAMPLE_FILENAME = (
    "@crafty_fixer_2026-04-16_1710-550-Genius-Household-Hacks-You-Need-to-Try-"
    "Life-Hack-Shack-#diy-#lifehacks-#tips-#tricks-#skills-7629298998284766486.mp4"
)

FAILED_FILENAMES = [
    "@videohack3-2026-04-17_0158-#lifehacks-#hacks-#tipsandtricks-7629510608748170510.mp4",
    "@jillian1631-2026-07-22_0707-#tipsandtricks-#lifehack-#tips-#trick-#DIY-7665214542409993486.mp4",
    "@diytips0-2026-09-29_0247-#dailytips-#lifehacks-#ideas-#useful-#tiktokgrowthchallenge-7690752359181339917.mp4",
    "@tipswithadam1-2026-03-29_1936-#dailytips-#LifeHack-#lifetips-#usa-#foryoupage-7622732848184790303.mp4",
    "@tracekdlmy9-2026-10-07_1617-#lifehacks-#lifetips-#learnontiktok-#fyp-#foryou-7693929842869390622.mp4",
    "@tracekdlmy9-2026-10-04_1803-#lifehacks-#lifetips-#learnontiktok-#fyp-#foryou-7692843878180850974.mp4",
    "@live_from_denmark-2026-09-25_0711-#lifehackvideo-7689336172396416278.mp4",
    "@reitekup3fw-2026-10-07_0830-#lifehacks-#lifetips-#learnontiktok-#fyp-#foryou-7693809353391885581.mp4",
]

SIDNEYRAZ_FILENAME = "@sidneyraz-2026-10-07_1805-i-tried-#cozy-#lifehack-7693957734345002270.mp4"
ATTACHED_HASHTAG_FILENAMES = {
    "@dailymomhacks-2026-05-01_1933-Genius-life-hack-from-mom#tipsandtricks-#momtok-#KitchenHacks-#cleantok-#diy-7634977685160201486.mp4": "Genius Life Hack From Mom",
    "@sports_foot_7-2026-03-06_1108-Life-hacks-my-ad-taught-me.#hacks-#fyp-#oddlysatisfyingvideo-#lifehack-#satisfying-#tiktokmademebuyi-7614082291500977421.mp4": "Life Hacks My Ad Taught Me.",
}

TRUNCATED_TITLE_FILENAMES = {
    "@handigetomas-2026-09-30_1631-Niemand-weet-dit-geheim-Opgelet-Want-dankzij-deze-tip-heb-jij-geen-last-meer-van-ladders-en-gaten-in-7691336016715631905.mp4": "Niemand Weet Dit Geheim Opgelet Want Dankzij Deze Tip Heb Jij Geen Last Meer Van Ladders En Gaten",
    "@wildskillspro-2026-09-03_0036-Smart-survival-skills-clever-DIY-hacks-and-seriously-satisfying-problem-solving-in-one-powerful-col-7681070514080599316.mp4": "Smart Survival Skills Clever DIY Hacks and Seriously Satisfying Problem Solving in One Powerful",
    "@alenaslifehacks-2026-10-06_1852-Schluss-mit-Mäusen-und-Ratten-im-Haus-mit-diesem-einfachen-Trick-aus-Alufolie-hältst-du-sie-sofort-f-7693598808038526241.mp4": "Schluss Mit Mäusen Und Ratten Im Haus Mit Diesem Einfachen Trick Aus Alufolie Hältst Du Sie Sofort",
}


class PostTextTests(unittest.TestCase):
    def test_filename_parser_extracts_creator_and_readable_title(self):
        post_text = build_post_text(EXAMPLE_FILENAME)

        self.assertEqual(post_text.creator_handle, "@crafty_fixer")
        self.assertEqual(post_text.title, "Genius Household Hacks You Need to Try Life Hack Shack")

    def test_failed_r2_filenames_use_safe_fallback_and_keep_creator(self):
        for filename in FAILED_FILENAMES:
            post_text = build_post_text(filename)
            self.assertEqual(post_text.title, "Life Hacks", filename)
            self.assertTrue(post_text.creator_handle.startswith("@"), filename)

    def test_sidneyraz_filename_preserves_all_available_title_words(self):
        post_text = build_post_text(SIDNEYRAZ_FILENAME)

        self.assertEqual(post_text.creator_handle, "@sidneyraz")
        self.assertEqual(post_text.title, "I Tried")

    def test_attached_hashtags_are_removed_from_title_end(self):
        for filename, expected_title in ATTACHED_HASHTAG_FILENAMES.items():
            self.assertEqual(build_post_text(filename).title, expected_title)

    def test_known_truncated_title_tails_are_removed_without_guessing(self):
        for filename, expected_title in TRUNCATED_TITLE_FILENAMES.items():
            self.assertEqual(build_post_text(filename).title, expected_title)

    def test_caption_assembly_order(self):
        post_text = build_post_text(EXAMPLE_FILENAME)

        self.assertEqual(
            post_text.caption.splitlines(),
            [post_text.description, "@crafty_fixer", LINK],
        )
        self.assertEqual(
            post_text.facebook_text.splitlines(),
            [post_text.title, "", post_text.description, "@crafty_fixer", LINK],
        )
        self.assertEqual(post_text.threads_text.splitlines()[0], post_text.title)

    def test_facebook_and_threads_validate_rendered_title_first_text(self):
        post_text = PostText("A useful title", "A short description", "@creator", LINK)

        self.assertEqual(validate_post_text(post_text, "lifemode_facebook"), [])
        self.assertEqual(validate_post_text(post_text, "lifemode_threads"), [])
        self.assertTrue(validate_post_text(PostText("x" * 490, "description", "@creator", LINK), "lifemode_threads"))

    def test_validation_reports_missing_fields_and_length_limits(self):
        invalid = PostText(title="", description="", creator_handle="bad", bio_link="")

        errors = validate_post_text(invalid, "everyday_pinterest")

        self.assertIn("title is empty", errors)
        self.assertIn("description is empty", errors)
        self.assertIn("creator handle is malformed", errors)
        self.assertIn("bio link is missing", errors)
        self.assertTrue(validate_post_text(PostText("x" * 101, "description", "", LINK), "everyday_pinterest"))


if __name__ == "__main__":
    unittest.main()
