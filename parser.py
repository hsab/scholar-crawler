# %%
import os
import time
import random
import json
import unicodedata
import requests
import argparse
import socket
import re
import requests
import bibjson
import urllib.parse as urlparse
from urllib.parse import parse_qs

from selenium import webdriver
from selenium.common.exceptions import StaleElementReferenceException
from selenium.webdriver.common.keys import Keys

from config import *


def randdelay(a, b):
	time.sleep(random.uniform(a, b))


def randdelayzero(a):
	time.sleep(random.uniform(0, a))


def u_to_s(uni):
	return unicodedata.normalize('NFKD', uni).encode('ascii', 'ignore')

# %%


class Scraper(object):

	def __init__(self, br):
		self.db = {}
		self.browser = br
		self.minWait = 1
		self.maxWait = 3
		self.scrollWait = 2
		self.minYear = 2000
		self.maxYear = 2021
		self.setRange = True

	def addRangeToURL(self, url):
		if self.setRange:
			range = '&as_ylo={}&as_yhi={}'.format(self.minYear, self.maxYear)
			url = url + range
		return url

	def loadDB(self):
		self.setupDir()
		dbPath = os.path.join(self.setupDir(), 'db.json')

		if os.path.isfile(dbPath):
			with open(dbPath) as outfile:
				self.db = json.load(outfile)

	def saveDB(self):
		dbPath = os.path.join(self.setupDir(), 'db.json')

		with open(dbPath, 'w') as outfile:
			json.dump(self.db, outfile, sort_keys=True, indent=4)

	def setupDir(self):
		dirPath = os.path.join(os.getcwd(), 'Data')
		os.makedirs(dirPath, exist_ok=True)
		return dirPath


	def skipRecaptcha(self):
		try:
			iframe = self.browser.find_elements_by_tag_name('iframe')[0]
			self.browser.switch_to.frame(iframe)
			randdelay(self.minWait, self.maxWait)
			checkbox = self.browser.find_elements_by_class_name('recaptcha-checkbox-border')
			checkbox.click()
			randdelay(self.minWait, self.maxWait)
		except:
			pass

	def goUrl(self, u):
		self.browser.get(u)
		self.skipRecaptcha()
		randdelay(self.minWait, self.maxWait)

	def goBack(self, iter=1):
		for i in range(0, iter):
			self.browser.execute_script("window.history.go(-1)")
			randdelay(self.minWait, self.maxWait)

	def scroll(self):
		dummy = self.browser.find_element_by_tag_name('body')
		for i in range(random.randint(1, 10)):
			dummy.send_keys(Keys.ARROW_DOWN)
			randdelayzero(self.scrollWait/10)

	def getRelated(self):
		ignoreSource = self.browser.find_element_by_xpath(
			'//*[@id="gs_res_ccl_mid"]')
		related = ignoreSource.find_elements_by_xpath('.//*[@class="gs_ri"]')
		return related

	def parseTitle(self, elem):
		titleElem = elem.find_element_by_xpath('.//*[@class="gs_rt"]')

		title= titleElem.text
		type = ''
		m = re.search(r"(\[.*\]\s)(.*)", title)
		if m:
			title = m.group(2)
			type = m.group(1).replace("[", "").replace("] ", "")

		href = ''
		gsid = ''
		try:
			link = titleElem.find_element_by_tag_name('a')
			href = link.get_attribute('href')
			gsid = link.get_attribute('id')
		except:
			span = titleElem.find_element_by_xpath('(.//span)[last()]')
			gsid = span.get_attribute('id')

		ret = {
			"link": href,
			"gs_id": gsid,
			"cited_by": [],
			"related": [],
			"related_parsed": 0,
			"citations_parsed": 0,
			"refs": [],
			"title": title,
			"type": type
		}

		return ret

	def grabGSUrl(self, elem):
		currentURL = self.browser.current_url
		if 'cluster' in currentURL:
			return currentURL.split('cluster=')[1].split('&')[0]
		else:
			try:
				xp = ".//*[contains(@class, 'gs_fl')]//a[contains(text(), 'Cited')]"
				link = elem.find_element_by_xpath(xp).get_attribute('href')
				return link.split('cites=')[1].split('&')[0]
			except:
				pass
			try:
				xp = ".//*[@class='gs_rt']"
				link = elem.find_element_by_xpath(
					xp).find_element_by_tag_name('a').get_attribute('data-clk')
				return link.split('&d=')[1].split('&')[0]
			except:
				return ''

	def getNextPage(self):
		try:
			xp = "//*[@id='gs_n']//td[last()]//*[contains(text(), 'Next')]/.."
			link = self.browser.find_element_by_xpath(xp).get_attribute('href')
			return link
		except:
			return ''

	def getPreviousPage(self):
		try:
			xp = "//*[@id='gs_n']//td[1]//*[contains(text(), 'Previous')]/.."
			link = self.browser.find_element_by_xpath(xp).get_attribute('href')
			return link
		except:
			return ''

	def hasNextPage(self):
		return self.getNextPage() != ''

	def hasPreviousPage(self):
		return self.getPreviousPage() != ''

	def parseBib(self, elem):
		id = elem['gs_id']
		href = citationURL.format(id)
		self.goUrl(href)
		bibHref = self.browser.find_element_by_xpath(
			'//*[contains(text(),"BibTeX")]').get_attribute('href')
		self.goUrl(bibHref)
		bibText = self.browser.find_element_by_xpath('//*[text()]').text
		bibj = bibjson.collection_from_bibtex_str(bibText, collection="")
		bibj = dict(bibj["records"][0])
		self.goBack(2)
		return bibj

	def populateURLS(self, elem):
		gsid = elem['gs_id']
		cite_url = elem['cite_url']
		url = {
			'urls':{
				'cluster': self.addRangeToURL(clusterURL.format(cite_url)),
				'cites': self.addRangeToURL(citesURL.format(cite_url)),
				'citations': self.addRangeToURL(citationURL.format(gsid)),
				'related': self.addRangeToURL(realtedURL.format(gsid))
			}
		}
		return url

	def getCitationCount(self, elem):
		try:
			xp = ".//*[contains(@class, 'gs_fl')]//a[contains(text(), 'Cited')]"
			link = elem.find_element_by_xpath(xp).text
			c = link.split("Cited by ")[1]
			return int(c)
		except:
			return 0

	def getDescription(self, elem):
		try:
			xp = ".//*[@class='gs_rs']"
			desc = elem.find_element_by_xpath(xp).text
			return desc
		except:
			return ''

	def getInfo(self, elem):
		try:
			xp = ".//*[@class='gs_a']"
			info = elem.find_element_by_xpath(xp).text
			return info.split(" - ")
		except:
			return []

	def getYear(self, elem):
		try:
			xp = ".//*[@class='gs_a']"
			info = elem.find_element_by_xpath(xp).text
			m = re.search(r"(\d{4})", info)
			if m:
				year = int(m.group(1))
			return year
		except:
			return 0

	def getItemObj(self, idx=0):
		t = self.getRelated()

		item = self.parseTitle(t[idx])

		if not self.isInDB(item):
			item["cite_url"] = self.grabGSUrl(t[idx])
			item["citation_count"] = self.getCitationCount(t[idx])
			item["description"] = self.getDescription(t[idx])
			item["info"] = self.getInfo(t[idx])
			item["year"] = self.getYear(t[idx])


			# bib = self.parseBib(item)
			# item.update(bib)

			# url = self.populateURLS(item)
			# item.update(url)

			self.addToDB(item)
			print(item)
			self.scroll()
			return item
		else:
			randdelay(self.minWait, self.maxWait)
			return self.getFromDB(item)

	def getTopItem(self):
		top = self.browser.find_element_by_xpath('//*[@id="gs_res_ccl_top"]')
		header = top.find_element_by_xpath('.//*[@class="gs_rt"]')
		link = header.find_element_by_tag_name('a').get_attribute('href')
		self.goUrl(link)
		iobj = self.getItemObj()
		self.goBack()
		return iobj

	def getCitingElements(self):
		related = self.getRelated()
		iterations = range(0, len(related))
		itemList = []
		for idx in iterations:
			t = self.getItemObj(idx)
			itemList.append(t)
		return itemList

	def getFromDB(self, elem):
		elemID = elem["gs_id"]
		if elemID in self.db:
			return self.db[elemID]

	def addToDB(self, elem):
		elemID = elem["gs_id"]
		if elemID not in self.db:
			self.db[elemID] = elem

	def isInDB(self, elem):
		elemID = elem["gs_id"]
		if elemID in self.db:
			return True
		return False

	def getDB(self):
		return self.db

	def addToCitedBy(self, elem, child):
		elemID = elem["gs_id"]
		self.db[elemID]["cited_by"].append(child["gs_id"])

	def addToRefs(self, elem, ref):
		elemID = elem["gs_id"]
		self.db[elemID]["refs"].append(ref["gs_id"])

	def addToRelated(self, elem1, elem2):
		self.db[elem1["gs_id"]]["related"].append(elem2["gs_id"])
		self.db[elem2["gs_id"]]["related"].append(elem1["gs_id"])

	def parseCitations(self, url):
		if 'cites' in url:
			id = url.split('cites=')[1].split('&')[0]
		if id:
			url = self.addRangeToURL(url)
			self.goUrl(url)
			parent = self.getTopItem()
			self.goUrl(url)

			itemList = self.getCitingElements()
			for i in itemList:
				self.addToCitedBy(parent, i)
				self.addToRefs(i, parent)

			elemID = parent["gs_id"]
			curr_page = self.db[elemID]["citations_parsed"]
			self.db[elemID]["citations_parsed"] = curr_page+1
			self.saveDB()

	def parseRelated(self, url):
		if 'related' in url:
			id = url.split('related:')[1].split(':')[0]
		if id:
			url = self.addRangeToURL(url)
			self.goUrl(url)
			print('goooooo')

			itemList = self.getCitingElements()
			for i, elem in enumerate(itemList):
				for j, elem2 in enumerate(itemList):
					self.addToRelated(itemList[i], itemList[j])

			elemID = id
			curr_page = self.db[elemID]["related_parsed"]
			self.db[elemID]["related_parsed"] = curr_page+1
			self.saveDB()

	def close(self):
		self.browser.close()


# %%
chrome_options = webdriver.ChromeOptions()
chrome_options.add_argument('--no-sandbox')
chrome_options.add_argument('user-data-dir=/home/hirad/.config/chromium/')
# chrome_options.add_argument('--headless')
chrome_options.add_argument('--disable-dev-shm-usage')
browser = webdriver.Chrome(
	'/usr/lib/chromium/chromedriver', options=chrome_options)
randdelay(2, 4)

# %%

# startURL = "https://scholar.google.com/scholar?q=related:KKuK71yHJjgJ:scholar.google.com/&scioq=&hl=en&as_sdt=2005&sciodt=0,5"
# startURL = "https://scholar.google.com/scholar?cites=4046070148464552744&as_sdt=2005&sciodt=0,5&hl=en"

purls = {
	'affective-turn': "https://scholar.google.com/scholar?q=related:zm_nh5-rbF8J:scholar.google.com/&scioq=affect+theory&hl=en&as_sdt=0,5&as_ylo=2000&as_yhi=2021",
	'para-bles-for-virtual': "https://scholar.google.com/scholar?q=related:Q5u7P6h7zZAJ:scholar.google.com/&scioq=affect+theory&hl=en&as_sdt=0,5&as_ylo=2000&as_yhi=2021",
	# 'post-cinematic-affect': "https://scholar.google.com/scholar?q=related:KKuK71yHJjgJ:scholar.google.com/&scioq=&hl=en&as_sdt=2005&sciodt=0,5",
	'new-materialism': "https://scholar.google.com/scholar?q=related:FpXqfe6uEBUJ:scholar.google.com/&scioq=vibrant+matter&hl=en&as_sdt=0,5&as_ylo=2000&as_yhi=2021",
	'never-modern':"https://scholar.google.com/scholar?q=related:IF_Y6NPvAC0J:scholar.google.com/&scioq=vibrant+matter&hl=en&as_sdt=0,5&as_ylo=2000&as_yhi=2021",
	'thinking-post-digital':"https://scholar.google.com/scholar?q=related:gqX05thoDIsJ:scholar.google.com/&scioq=&hl=en&as_sdt=0,5",
	'ordinary-affect':"https://scholar.google.com/scholar?q=related:8z_VtbeClQgJ:scholar.google.com/&scioq=&hl=en&as_sdt=2005&sciodt=0,5",
	'hyperobj':"https://scholar.google.com/scholar?q=related:Kc7JOL4efNEJ:scholar.google.com/&scioq=hyperobjects&hl=en&as_sdt=0,5&as_ylo=2000&as_yhi=2021",
	'aline-phenom':"https://scholar.google.com/scholar?q=related:mG5Xte1Y7NMJ:scholar.google.com/&scioq=hyperobjects&hl=en&as_sdt=0,5&as_ylo=2000&as_yhi=2021",
	'culture-of-speed':"https://scholar.google.com/scholar?q=related:MOjHSf0rPewJ:scholar.google.com/&scioq=&hl=en&as_sdt=2005&sciodt=0,5",
	'wretched':"https://scholar.google.com/scholar?q=related:V8jkIlUYV0IJ:scholar.google.com/&scioq=wretched+of+the+screen&hl=en&as_sdt=0,5",
	"mue-birth":"https://scholar.google.com/scholar?q=related:11JdKYbcc-0J:scholar.google.com/&scioq=&hl=en&as_sdt=0,5",
	"revolting-subs":"https://scholar.google.com/scholar?q=related:HS-eR5T2AigJ:scholar.google.com/&scioq=&hl=en&as_sdt=2005&sciodt=0,5",
	"secure-vol":"https://scholar.google.com/scholar?q=related:l28Ju14OTrEJ:scholar.google.com/&scioq=&hl=en&as_sdt=2005&sciodt=0,5",
	"wet-ontology":"https://scholar.google.com/scholar?q=related:DtbaKjvChi0J:scholar.google.com/&scioq=&hl=en&as_sdt=0,5",
	"non-rep-theory":"https://scholar.google.com/scholar?q=related:kSAtGYe0M64J:scholar.google.com/&scioq=&hl=en&as_sdt=2005&sciodt=0,5",
	"non-rep-2":"https://scholar.google.com/scholar?q=related:yMef1if_6_8J:scholar.google.com/&scioq=&hl=en&as_sdt=2005&sciodt=0,5",
	"po":"https://scholar.google.com/scholar?q=related:AS60p-H5sqQJ:scholar.google.com/&scioq=&hl=en&as_sdt=0,5",
	"vis-meth":"https://scholar.google.com/scholar?q=related:BJxMK60OiHoJ:scholar.google.com/&scioq=&hl=en&as_sdt=2005&sciodt=0,5",
	"pomocon":"https://scholar.google.com/scholar?q=related:Xit5pP0dnm0J:scholar.google.com/&scioq=&hl=en&as_sdt=0,5",
	"newmedlang":"https://scholar.google.com/scholar?q=related:ypavD99WjX0J:scholar.google.com/&scioq=&hl=en&as_sdt=2005&sciodt=0,5",
	"imagined-comms":"https://scholar.google.com/scholar?q=related:msZuoh6Dh7sJ:scholar.google.com/&scioq=&hl=en&as_sdt=0,5",
	"riseofnet":"https://scholar.google.com/scholar?q=related:3ObuSifB__UJ:scholar.google.com/&scioq=&hl=en&as_sdt=0,5",
	"":"https://scholar.google.com/scholar?q=related:Xit5pP0dnm0J:scholar.google.com/&scioq=&hl=en&as_sdt=0,5",
	"wepomo":"https://scholar.google.com/scholar?q=related:IlxabsfSnA0J:scholar.google.com/&scioq=how+we+became+posthuman&hl=en&as_sdt=0,5",
	"assem":"https://scholar.google.com/scholar?q=related:axuq8njl_T8J:scholar.google.com/&scioq=Assemblage+Theory&hl=en&as_sdt=0,5",
	"sacred":"https://scholar.google.com/scholar?q=related:Cw5UjBN5PD8J:scholar.google.com/&scioq=Adrian+Ivakhiv&hl=en&as_sdt=0,5",
	"ecomove":"https://scholar.google.com/scholar?q=related:M2jI8wiFO58J:scholar.google.com/&scioq=Adrian+Ivakhiv&hl=en&as_sdt=0,5",
	"ecopsych":'https://scholar.google.com/scholar?q=related:q6fwHMyF9zUJ:scholar.google.com/&scioq=&hl=en&as_sdt=2005&sciodt=0,5',
	"ess_onacc":'https://scholar.google.com/scholar?q=related:Hpe8rRGSydMJ:scholar.google.com/&scioq=accelerationism&hl=en&as_sdt=0,5',
	"end_world":'https://scholar.google.com/scholar?q=related:SAnA1FklhZcJ:scholar.google.com/&scioq=&hl=en&as_sdt=2005&sciodt=0,5',
	"capitolo":'https://scholar.google.com/scholar?q=related:Atf6wqMouJkJ:scholar.google.com/&scioq=&hl=en&as_sdt=2005&sciodt=0,5',
	"cthulu":'https://scholar.google.com/scholar?q=related:GcdCL63ZV8EJ:scholar.google.com/&scioq=&hl=en&as_sdt=2005&sciodt=0,5',
	"mushroom":'https://scholar.google.com/scholar?q=related:N50lu4EV6gMJ:scholar.google.com/&scioq=&hl=en&as_sdt=0,5',
	"climatehist":'https://scholar.google.com/scholar?q=related:IY2r09YF-doJ:scholar.google.com/&scioq=&hl=en&as_sdt=2005&sciodt=0,5',
	"gaia":'https://scholar.google.com/scholar?q=related:y3g8L-jnYzYJ:scholar.google.com/&scioq=&hl=en&as_sdt=0,5',
}

kks = [i for i in purls]
idx = 21

# %%
gs = Scraper(browser)
gs.loadDB()

gs.parseRelated(purls[kks[idx]])
for i in range(0,3):
	nextUrl = gs.getNextPage()
	gs.parseRelated(nextUrl)
print(gs.getDB())
gs.saveDB()
idx = idx +1

# %%


# %%
